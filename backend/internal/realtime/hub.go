// Package realtime pushes live events to connected dashboards over WebSocket.
// Clients are grouped per merchant+mode so a dashboard only sees its own,
// correctly-scoped activity.
package realtime

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Message is the live event pushed to dashboards.
type Message struct {
	Type      string `json:"type"`
	Mode      string `json:"mode"`
	CreatedAt string `json:"created_at"`
	Data      any    `json:"data"`
}

type client struct {
	conn *websocket.Conn
	send chan []byte
}

// Hub fans broadcasts out to all clients for a given merchant+mode key.
type Hub struct {
	mu       sync.RWMutex
	clients  map[string]map[*client]struct{}
	upgrader websocket.Upgrader
	logger   *slog.Logger
}

// NewHub constructs a Hub. Origin checks are handled by the API's CORS posture;
// the upgrade itself allows any origin (tokens still gate access).
func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients:  make(map[string]map[*client]struct{}),
		upgrader: websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }},
		logger:   logger,
	}
}

func key(merchantID uuid.UUID, mode string) string { return merchantID.String() + ":" + mode }

// Broadcast sends an event to every dashboard connected for this merchant+mode.
func (h *Hub) Broadcast(merchantID uuid.UUID, mode, eventType string, data any) {
	msg := Message{
		Type:      eventType,
		Mode:      mode,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[key(merchantID, mode)] {
		select {
		case c.send <- payload:
		default: // slow client — drop rather than block the broadcaster
		}
	}
}

// Serve upgrades the request to a WebSocket and registers it under merchant+mode.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, merchantID uuid.UUID, mode string) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 16)}
	h.add(merchantID, mode, c)

	go h.writePump(c)
	h.readPump(merchantID, mode, c) // blocks until the client disconnects
}

func (h *Hub) add(merchantID uuid.UUID, mode string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	k := key(merchantID, mode)
	if h.clients[k] == nil {
		h.clients[k] = make(map[*client]struct{})
	}
	h.clients[k][c] = struct{}{}
}

func (h *Hub) remove(merchantID uuid.UUID, mode string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	k := key(merchantID, mode)
	if set := h.clients[k]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, k)
		}
	}
	close(c.send)
}

func (h *Hub) readPump(merchantID uuid.UUID, mode string, c *client) {
	defer func() {
		h.remove(merchantID, mode, c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(1024)
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *Hub) writePump(c *client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
