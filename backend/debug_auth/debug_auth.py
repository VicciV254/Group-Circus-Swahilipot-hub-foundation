"""
Nexus Debug — Temporary login test view
Add to backend/Nexus/urls.py temporarily to diagnose login issues

Usage: GET http://localhost:8000/debug-auth/
"""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate
import json


@csrf_exempt
def debug_auth(request):
    """Temporary debug endpoint — REMOVE IN PRODUCTION"""

    if request.method == 'GET':
        # List all users
        try:
            from apps.accounts.models import User
            users = list(User.objects.values(
                'email', 'is_active', 'role',
                'first_name', 'last_name'
            ))
            return JsonResponse({
                'user_count': len(users),
                'users': users,
                'auth_user_model': User.__name__,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    if request.method == 'POST':
        try:
            data  = json.loads(request.body)
            email = data.get('email', '')
            pwd   = data.get('password', '')

            from apps.accounts.models import User

            # Check user exists
            try:
                user = User.objects.get(email=email)
                user_info = {
                    'found':     True,
                    'email':     user.email,
                    'is_active': user.is_active,
                    'role':      user.role,
                    'has_password': user.has_usable_password(),
                    'password_check': user.check_password(pwd),
                }
            except User.DoesNotExist:
                user_info = {'found': False, 'email': email}

            # Try Django authenticate
            auth_result = authenticate(request, username=email, password=pwd)

            return JsonResponse({
                'user_info':   user_info,
                'auth_result': str(auth_result),
                'authenticated': auth_result is not None,
            })

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'method': request.method})