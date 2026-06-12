# Everything a new starter needs on their first morning. Each target assumes
# nothing but Node 20 and a PostgreSQL they can reach.

SERVICE := registry-service
CONSOLE := registry-console

.DEFAULT_GOAL := help

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

.PHONY: install
install: ## fetch every dependency both sides need
	npm ci

.PHONY: service
service: ## run the registry service against a local postgres
	cd $(SERVICE) && npm run start:dev

.PHONY: console
console: ## run the console with the api proxied to localhost 8080
	cd $(CONSOLE) && npm start

.PHONY: dev
dev: ## bring a database, the service and the console up together
	./scripts/dev-up.sh

.PHONY: demo
demo: ## run the service with a laboratory already in it
	cd $(SERVICE) && REGISTRY_DEMO_ESTATE=true npm run start:dev

.PHONY: e2e
e2e: ## drive the console end to end against a stubbed service
	npm run e2e

.PHONY: test
test: test-backend test-frontend ## run every test in the repository

.PHONY: test-backend
test-backend: ## unit and integration tests for the service
	cd $(SERVICE) && npm test && npm run test:integration

.PHONY: test-frontend
test-frontend: ## jest suite for the console
	cd $(CONSOLE) && npm test

.PHONY: coverage
coverage: ## coverage reports for both sides
	cd $(SERVICE) && npm run test:coverage
	cd $(CONSOLE) && npm run test:coverage

.PHONY: lint
lint: ## eslint over the console, templates included
	cd $(CONSOLE) && npm run lint

.PHONY: typecheck
typecheck: ## strict typescript pass over both sides without emitting
	cd $(SERVICE) && npm run typecheck
	cd $(CONSOLE) && npm run typecheck

.PHONY: build
build: ## build both deployable artefacts
	cd $(SERVICE) && npm run build
	cd $(CONSOLE) && npm run build

.PHONY: images
images: ## build both container images the way compose builds them
	docker build -f $(SERVICE)/Dockerfile -t slipgauge/registry-service:local .
	docker build -f $(CONSOLE)/Dockerfile -t slipgauge/registry-console:local .

.PHONY: audit
audit: ## advisories against what actually ships
	npm run audit

.PHONY: review
review: ## build the management review pack against a running service
	@curl -fsS -H "Authorization: Bearer $$REGISTRY_TOKEN" \
		http://localhost:8080/api/management-review | node -e \
		"let b='';process.stdin.on('data',c=>b+=c).on('end',()=>{const p=JSON.parse(b);\
		console.log(p.period.from+' to '+p.period.to);p.talkingPoints.forEach(t=>console.log(' - '+t));})"

.PHONY: loggers
loggers: ## poll the room loggers once and post what they hold
	cd $(SERVICE) && npm run build --silent && node dist/tools/logger-poll.js

.PHONY: verify
verify: ## everything ci runs, in the order ci runs it
	./scripts/check.sh

.PHONY: clean
clean: ## remove build output on both sides
	rm -rf $(SERVICE)/dist $(SERVICE)/coverage
	rm -rf $(CONSOLE)/dist $(CONSOLE)/coverage $(CONSOLE)/.angular
