.PHONY: up down build logs backend-logs frontend-logs migrate migration seed test shell clean restart ps

# ---------------------------------------------------------------------------
# Docker Compose helpers
# ---------------------------------------------------------------------------

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

backend-logs:
	docker compose logs -f backend

frontend-logs:
	docker compose logs -f frontend

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

migrate:
	docker compose exec backend alembic upgrade head

migration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec backend python -m scripts.seed

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

test:
	docker compose exec backend pytest

shell:
	docker compose exec backend bash

clean:
	docker compose down -v --remove-orphans

restart:
	docker compose restart

ps:
	docker compose ps
