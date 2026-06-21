from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'budgets',         views.BudgetViewSet,        basename='budget')
router.register(r'expenses',        views.ExpenseViewSet,        basename='expense')
router.register(r'invoices',        views.InvoiceViewSet,        basename='invoice')
router.register(r'petty-cash',      views.PettyCashViewSet,      basename='petty-cash')
router.register(r'purchase-orders', views.PurchaseOrderViewSet,  basename='purchase-order')
router.register(r'payments',        views.PaymentViewSet,        basename='payment')
router.register(r'stipends',        views.StipendViewSet,        basename='stipend')
# NOTE: 'payroll' and 'reports' are NOT registered via the router because they
# have custom sub-paths (/process/, /generate/) that the router would intercept
# and return 405 before our explicit path() entries could match.

urlpatterns = [
    # ── All router-managed endpoints ──────────────────────────────────────────
    path('', include(router.urls)),

    # ── Payroll (manual — keeps /process/ and /payslip/ safe from router) ────
    path('payroll/',                    views.PayrollViewSet.as_view({'get': 'list', 'post': 'create'}),           name='payroll-list'),
    path('payroll/process/',            views.ProcessPayrollView.as_view(),                                        name='payroll-process'),
    path('payroll/<uuid:pk>/',          views.PayrollViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='payroll-detail'),
    path('payroll/<uuid:pk>/payslip/',  views.PayslipView.as_view(),                                              name='payslip'),

    # ── Reports (manual — keeps /generate/ safe from router) ─────────────────
    path('reports/',                    views.FinancialReportViewSet.as_view({'get': 'list'}),                     name='reports-list'),
    path('reports/generate/',           views.GenerateReportView.as_view(),                                        name='generate-report'),
    path('reports/<uuid:pk>/',          views.FinancialReportViewSet.as_view({'get': 'retrieve', 'delete': 'destroy'}), name='reports-detail'),

    # ── Cash flow & expense category breakdown ────────────────────────────────
    path('cash-flow/',          views.CashFlowView.as_view(),                   name='cash-flow'),
    path('expense-categories/', views.ExpenseCategoryBreakdownView.as_view(),   name='expense-categories'),

    # ── Action endpoints ──────────────────────────────────────────────────────
    path('expenses/<uuid:pk>/action/',        views.ExpenseActionView.as_view(),       name='expense-action'),
    path('invoices/<uuid:pk>/action/',        views.InvoiceActionView.as_view(),       name='invoice-action'),
    path('petty-cash/<uuid:pk>/action/',      views.PettyCashActionView.as_view(),     name='petty-cash-action'),
    path('purchase-orders/<uuid:pk>/action/', views.PurchaseOrderActionView.as_view(), name='purchase-order-action'),
    path('stipends/<uuid:pk>/process/',       views.ProcessStipendView.as_view(),      name='stipend-process'),
]