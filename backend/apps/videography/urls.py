from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ShootBookingViewSet

router = DefaultRouter()
router.register(r'', ShootBookingViewSet, basename='videography')

urlpatterns = [
    path('', include(router.urls)),
]