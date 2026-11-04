# One entry point for both layers.
#
#   make setup        install Node deps, Chromium and the Python venv
#   make test         UI suite (unit + live + mocked), then pytest on the records that run produced
#   make ui           UI suite only            (UI_ARGS="..." passes extra Playwright options)
#   make api          pytest on artifacts/records (the last UI run)
#   make api-samples  pytest on the committed samples: no login, no network
#   make lint         tsc, ESLint, Prettier, ruff
#   make report       open the Playwright HTML report
#
# Live and mocked UI tests log in with the credentials in .env (see .env.example).

UI      := ui-tests
API     := api-tests
PW      := ./node_modules/.bin/playwright
VENV    := $(API)/.venv
PY      := $(VENV)/bin/python
RECORDS := artifacts/records
UI_ARGS ?=

.PHONY: help setup test ui api api-samples lint report clean-records

help:
	@sed -n 's/^#   //p' $(MAKEFILE_LIST)

setup:
	cd $(UI) && npm ci && $(PW) install chromium
	python3 -m venv $(VENV)
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r $(API)/requirements.txt

# The Python layer runs even when UI tests fail, so the records of the tests that passed are still checked.
# The exit code is non-zero if either layer failed.
test:
	@ui=0; $(MAKE) --no-print-directory ui || ui=$$?; \
	$(MAKE) --no-print-directory api || exit $$?; \
	exit $$ui

# Old records are removed first, so pytest validates this run only.
ui: clean-records
	cd $(UI) && $(PW) test --project=unit --project=live --project=mocked $(UI_ARGS)

api: $(PY)
	cd $(API) && .venv/bin/pytest --html=reports/report.html --self-contained-html

api-samples: $(PY)
	cd $(API) && AQX_RECORDS_DIR=tests/fixtures/records .venv/bin/pytest

lint: $(PY)
	cd $(UI) && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && ./node_modules/.bin/prettier --check src tests
	cd $(API) && .venv/bin/ruff check . && .venv/bin/ruff format --check .

report:
	cd $(UI) && $(PW) show-report

clean-records:
	rm -f $(RECORDS)/*.json

$(PY):
	@echo "Python venv missing: run 'make setup' first." >&2 && exit 1
