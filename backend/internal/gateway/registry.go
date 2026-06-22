package gateway

import "fmt"

// Registry resolves a PaymentGateway by provider name. The billing engine uses
// it to charge through whichever gateway a given merchant has connected, so the
// platform is genuinely multi-gateway rather than Stripe-only.
type Registry struct {
	gateways map[string]PaymentGateway
}

// NewRegistry builds a registry from the given gateway implementations, keyed by
// each gateway's Name().
func NewRegistry(gws ...PaymentGateway) *Registry {
	m := make(map[string]PaymentGateway, len(gws))
	for _, g := range gws {
		m[g.Name()] = g
	}
	return &Registry{gateways: m}
}

// Get returns the gateway for a provider, or an error if none is registered.
func (r *Registry) Get(provider string) (PaymentGateway, error) {
	g, ok := r.gateways[provider]
	if !ok {
		return nil, fmt.Errorf("no gateway registered for provider %q", provider)
	}
	return g, nil
}

// Providers lists the registered provider names.
func (r *Registry) Providers() []string {
	out := make([]string, 0, len(r.gateways))
	for name := range r.gateways {
		out = append(out, name)
	}
	return out
}
