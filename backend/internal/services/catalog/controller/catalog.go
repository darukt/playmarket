// Package controller adapts the public catalog HTTP contract.
package controller

import (
	"net/http"
	"playmarket-backend/internal/httpx"
	catalog "playmarket-backend/internal/services/catalog/services"
	"strconv"
	"strings"
)

type Controller struct{ Catalog *catalog.Service }

// GET /api/catalog?q=&category=&kind=app|web&sort=rating|downloads|name|fresh&limit=
func (c *Controller) List(w http.ResponseWriter, r *http.Request) {
	if !httpx.AllowMethods(w, r, http.MethodGet) {
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	httpx.WriteJSON(w, http.StatusOK, c.Catalog.Filter(catalog.Query{
		Q:        q.Get("q"),
		Category: q.Get("category"),
		Kind:     strings.ToLower(q.Get("kind")),
		Sort:     strings.ToLower(q.Get("sort")),
		Limit:    limit,
	}))
}

// GET /api/apps/{id}
func (c *Controller) One(w http.ResponseWriter, r *http.Request) {
	if !httpx.AllowMethods(w, r, http.MethodGet) {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/apps/"), "/")
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing id")
		return
	}
	e, ok := c.Catalog.Get(id)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, e)
}
