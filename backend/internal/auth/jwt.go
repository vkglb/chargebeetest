package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ErrInvalidToken is returned when a JWT fails validation.
var ErrInvalidToken = errors.New("invalid token")

// Claims is the dashboard session payload.
type Claims struct {
	MerchantID uuid.UUID `json:"merchant_id"`
	UserID     uuid.UUID `json:"user_id"`
	Role       string    `json:"role"`
	jwt.RegisteredClaims
}

// TokenManager issues and verifies dashboard JWTs.
type TokenManager struct {
	secret []byte
	ttl    time.Duration
}

// NewTokenManager builds a TokenManager. ttl defaults to 24h if non-positive.
func NewTokenManager(secret string, ttl time.Duration) *TokenManager {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &TokenManager{secret: []byte(secret), ttl: ttl}
}

// Issue creates a signed token for a merchant user.
func (m *TokenManager) Issue(merchantID, userID uuid.UUID, role string, now time.Time) (string, error) {
	claims := Claims{
		MerchantID: merchantID,
		UserID:     userID,
		Role:       role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(m.secret)
}

// Verify parses and validates a token, returning its claims.
func (m *TokenManager) Verify(tokenString string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
