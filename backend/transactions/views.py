import csv
import io
import logging
from decimal import Decimal
from datetime import datetime
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import ValidationError
from django.db.models import Sum

from .models import Transaction
from .serializers import TransactionSerializer

logger = logging.getLogger(__name__)

class TransactionPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class TransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = TransactionPagination

    def get_queryset(self):
        queryset = Transaction.objects.filter(user=self.request.user)
        
        # Filter by category (case-insensitive query matches)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__iexact=category.strip())
            
        # Filter by date range
        date_after = self.request.query_params.get('date_after')
        if date_after:
            try:
                parsed_date = datetime.strptime(date_after.strip(), '%Y-%m-%d').date()
                queryset = queryset.filter(date__gte=parsed_date)
            except ValueError:
                raise ValidationError({"date_after": "Invalid date format. Use YYYY-MM-DD."})

        date_before = self.request.query_params.get('date_before')
        if date_before:
            try:
                parsed_date = datetime.strptime(date_before.strip(), '%Y-%m-%d').date()
                queryset = queryset.filter(date__lte=parsed_date)
            except ValueError:
                raise ValidationError({"date_before": "Invalid date format. Use YYYY-MM-DD."})

        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class TransactionCSVUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        file = request.FILES.get('file')
        if not file:
            logger.warning(f"[DEBUG LOG] CSV upload attempted with no file key by user={request.user.username}")
            return Response({'error': 'No file uploaded under key "file"'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
        except Exception as e:
            logger.error(f"[API ERROR] CSV parsing failed for user={request.user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'Failed to parse CSV file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure headers are present
        if not reader.fieldnames:
            logger.warning(f"[DEBUG LOG] CSV upload missing headers by user={request.user.username}")
            return Response({'error': 'CSV file is empty or missing headers.'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize field names to lowercase
        headers = [h.lower().strip() if h else '' for h in reader.fieldnames]
        if 'date' not in headers or 'amount' not in headers or 'category' not in headers:
            logger.warning(f"[DEBUG LOG] CSV upload missing required headers by user={request.user.username}. Headers found: {headers}")
            return Response(
                {'error': 'CSV must contain "date", "amount", and "category" headers.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        transactions_to_create = []
        errors = []

        for index, row in enumerate(reader):
            row_num = index + 1
            # Normalize row keys
            row = {k.lower().strip() if k else '': v for k, v in row.items()}
            
            date_str = row.get('date', '').strip()
            amount_str = row.get('amount', '').strip()
            category = row.get('category', '').strip()
            description = row.get('description', '').strip() if 'description' in row else ''

            if not date_str or not amount_str or not category:
                errors.append(f"Row {row_num}: Missing required columns ('date', 'amount', or 'category')")
                continue

            # Validate date format
            try:
                date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                errors.append(f"Row {row_num}: Invalid date format '{date_str}'. Expected YYYY-MM-DD.")
                continue

            # Validate amount decimal
            try:
                amount_dec = Decimal(amount_str)
            except Exception:
                errors.append(f"Row {row_num}: Invalid decimal amount '{amount_str}'.")
                continue

            transactions_to_create.append(Transaction(
                user=request.user,
                date=date_obj,
                amount=amount_dec,
                category=category,
                description=description
            ))

        if errors:
            logger.warning(f"[DEBUG LOG] CSV validation errors for user={request.user.username}: {errors}")
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        if not transactions_to_create:
            logger.warning(f"[DEBUG LOG] CSV uploaded contains no transactions for user={request.user.username}")
            return Response({'error': 'No transactions found in CSV file to import.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            Transaction.objects.bulk_create(transactions_to_create)
            
            # Trigger anomaly detection and forecast generation asynchronously
            from transactions.tasks import run_anomaly_detection, generate_forecast
            run_anomaly_detection.delay(request.user.id)
            generate_forecast.delay(request.user.id)

            logger.info(
                f"[DEBUG LOG] TransactionCSVUploadView: Successfully uploaded {len(transactions_to_create)} "
                f"transactions and enqueued Celery tasks for user={request.user.username}"
            )
        except Exception as e:
            logger.error(f"[API ERROR] Database write or task enqueue failed for user={request.user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'Database write failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(
            {'message': f'Successfully uploaded and created {len(transactions_to_create)} transactions'},
            status=status.HTTP_201_CREATED
        )


class TransactionStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            # 1. Total Spent (no filters except user)
            total_spent = Transaction.objects.filter(user=request.user).aggregate(
                total=Sum("amount")
            )["total"] or 0

            # 2. Top Category (no filters except user)
            top_category_query = (
                Transaction.objects.filter(user=request.user)
                .values("category")
                .annotate(total=Sum("amount"))
                .order_by("-total")
                .first()
            )
            top_category = top_category_query["category"] if top_category_query else "N/A"

            # 3. Anomalies Count (for the user)
            anomalies_count = Transaction.objects.filter(user=request.user, is_anomaly=True).count()
            
            # Total Transaction Count
            transaction_count = Transaction.objects.filter(user=request.user).count()

            # Logging
            logger.info(
                f"[DEBUG LOG] TransactionStatsView: user={request.user.username}, "
                f"transaction_count={transaction_count}, total_spent={total_spent}, "
                f"top_category='{top_category}', anomalies_count={anomalies_count}"
            )

            return Response({
                "total_spent": float(total_spent),
                "top_category": top_category,
                "anomalies_count": anomalies_count,
                "transaction_count": transaction_count
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"[API ERROR] TransactionStatsView failed: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
