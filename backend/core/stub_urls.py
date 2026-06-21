"""Nexus — Stub URL files for all remaining apps"""
# Each app needs a urls.py even if minimal

# This file is copied to each app's urls.py during setup
# Actual endpoints are defined in the respective views.py

from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView


class PlaceholderView(APIView):
    module = 'unknown'

    def get(self, request):
        return Response({'module': self.module, 'status': 'ready', 'detail': 'Module endpoints active'})

    def post(self, request):
        return Response({'module': self.module, 'status': 'ready'}, status=201)
