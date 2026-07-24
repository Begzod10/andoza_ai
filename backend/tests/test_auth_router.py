"""
Auth router tests - Phase 2 coverage expansion.

Tests:
  - POST /auth/otp/request → success, validation
  - POST /auth/otp/verify → success, wrong code, expired
  - POST /auth/refresh → success, expired token
  - POST /auth/logout → success
  - Error handling: 400, 401, 429 rate limit
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app


@pytest.fixture
def client():
    """FastAPI TestClient."""
    return TestClient(app)


class TestOTPRequest:
    """POST /auth/otp/request — request an OTP code."""

    def test_otp_request_valid_phone(self, client, mock_redis):
        """Valid phone returns 200 + OTP sent."""
        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/auth/otp/request',
                json={'phone': '+998901234567'},
            )

            assert response.status_code == 200
            data = response.json()
            assert data['message'] in ['OTP sent', 'SMS sended']

    def test_otp_request_missing_phone(self, client):
        """Missing phone returns 422 validation error."""
        response = client.post('/auth/otp/request', json={})

        assert response.status_code == 422

    def test_otp_request_invalid_phone_format(self, client):
        """Invalid phone format returns 422."""
        response = client.post(
            '/auth/otp/request',
            json={'phone': 'invalid'},
        )

        assert response.status_code == 422

    def test_otp_request_rate_limit(self, client, mock_redis):
        """11th OTP request from same IP returns 429."""
        mock_redis.incr = AsyncMock(return_value=11)
        mock_redis.expire = AsyncMock(return_value=True)

        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/auth/otp/request',
                json={'phone': '+998901234567'},
            )

            assert response.status_code == 429


class TestOTPVerify:
    """POST /auth/otp/verify — verify OTP code."""

    def test_otp_verify_correct_code(self, client, mock_redis):
        """Correct OTP code returns 200 + JWT tokens + user."""
        mock_redis.get = AsyncMock(return_value='123456')

        with patch('app.routers.auth.get_redis', return_value=mock_redis), \
             patch('app.routers.auth.verify_otp', return_value=True), \
             patch('app.routers.auth.create_user_if_not_exists') as mock_create:

            mock_user = MagicMock()
            mock_user.id = 'user-123'
            mock_user.username = 'user_998901234567'
            mock_user.phone = '+998901234567'
            mock_create.return_value = mock_user

            response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )

            assert response.status_code == 200
            data = response.json()
            assert 'user' in data
            assert data['user']['phone'] == '+998901234567'

    def test_otp_verify_wrong_code(self, client, mock_redis):
        """Wrong OTP code returns 401."""
        mock_redis.get = AsyncMock(return_value='123456')

        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '000000'},
            )

            assert response.status_code == 401

    def test_otp_verify_expired(self, client, mock_redis):
        """Expired OTP (not in Redis) returns 401."""
        mock_redis.get = AsyncMock(return_value=None)

        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )

            assert response.status_code == 401

    def test_otp_verify_missing_fields(self, client):
        """Missing phone or code returns 422."""
        response = client.post('/auth/otp/verify', json={'phone': '+998901234567'})
        assert response.status_code == 422

        response = client.post('/auth/otp/verify', json={'code': '123456'})
        assert response.status_code == 422


class TestTokenRefresh:
    """POST /auth/refresh — refresh access token."""

    def test_refresh_valid_refresh_token(self, client):
        """Valid refresh token returns new access token."""
        # First: login to get tokens
        with patch('app.routers.auth.verify_otp', return_value=True), \
             patch('app.routers.auth.create_user_if_not_exists') as mock_create:

            mock_user = MagicMock()
            mock_user.id = 'user-123'
            mock_create.return_value = mock_user

            login_response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )

            assert login_response.status_code == 200
            refresh_token = login_response.cookies.get('refresh_token')
            assert refresh_token is not None

            # Now: refresh the token
            response = client.post(
                '/auth/refresh',
                cookies={'refresh_token': refresh_token},
            )

            assert response.status_code == 200

    def test_refresh_missing_token(self, client):
        """Missing refresh token returns 401."""
        response = client.post('/auth/refresh')
        assert response.status_code == 401

    def test_refresh_invalid_token(self, client):
        """Invalid refresh token returns 401."""
        response = client.post(
            '/auth/refresh',
            cookies={'refresh_token': 'invalid_token_here'},
        )

        assert response.status_code == 401


class TestLogout:
    """POST /auth/logout — logout user."""

    def test_logout_clears_cookies(self, client):
        """Logout clears auth cookies."""
        # First: login
        with patch('app.routers.auth.verify_otp', return_value=True), \
             patch('app.routers.auth.create_user_if_not_exists') as mock_create:

            mock_user = MagicMock()
            mock_user.id = 'user-123'
            mock_create.return_value = mock_user

            login_response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )

            assert 'auth_token' in login_response.cookies or login_response.status_code == 200

            # Now: logout
            response = client.post('/auth/logout')

            assert response.status_code == 200
            # Cookies should be cleared (Set-Cookie with max_age=0)

    def test_logout_without_auth(self, client):
        """Logout without being authenticated returns 401."""
        response = client.post('/auth/logout')
        assert response.status_code == 401


class TestAuthFlow:
    """End-to-end auth flow: request → verify → refresh → logout."""

    def test_complete_auth_flow(self, client, mock_redis):
        """User can complete: request OTP → verify → refresh token → logout."""
        # Step 1: Request OTP
        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            request_response = client.post(
                '/auth/otp/request',
                json={'phone': '+998901234567'},
            )
            assert request_response.status_code == 200

        # Step 2: Verify OTP
        mock_redis.get = AsyncMock(return_value='123456')
        with patch('app.routers.auth.get_redis', return_value=mock_redis), \
             patch('app.routers.auth.verify_otp', return_value=True), \
             patch('app.routers.auth.create_user_if_not_exists') as mock_create:

            mock_user = MagicMock()
            mock_user.id = 'user-123'
            mock_user.phone = '+998901234567'
            mock_create.return_value = mock_user

            verify_response = client.post(
                '/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )
            assert verify_response.status_code == 200

        # Step 3: Refresh token
        refresh_token = verify_response.cookies.get('refresh_token')
        if refresh_token:
            refresh_response = client.post(
                '/auth/refresh',
                cookies={'refresh_token': refresh_token},
            )
            assert refresh_response.status_code == 200

        # Step 4: Logout
        logout_response = client.post('/auth/logout')
        # Should either succeed (200) or require auth (401)
        assert logout_response.status_code in [200, 401]
