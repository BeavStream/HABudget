# Koll på Berget — Home Assistant Add-on

Delad hushållsbudget som körs lokalt på din Home Assistant-maskin, med
riktig live-synk mellan alla enheter över WebSocket. All data ligger i en
fil på din egen maskin (`/data/state.json` inuti tillägget) — inget lämnar
hemmet.

## Installera

1. I Home Assistant: **Inställningar → Tillägg → Tilläggsbutiken**.
2. Klicka på **⋮** (tre punkter) uppe till höger → **Repositories**.
3. Klistra in: `https://github.com/BeavStream/HABudget` → **Add**.
4. Ladda om sidan. **Koll på Berget** dyker upp i listan över tillägg.
5. Klicka på det → **Install** → **Start**.
6. Aktivera **"Show in sidebar"** för att få en egen flik i menyn.

## Uppdatera

När en ny version pushats hit visar Tilläggsbutiken en **Update**-knapp —
klicka den, klart.

## Utveckling / lokal test

```bash
cd habudget/app
pip install fastapi "uvicorn[standard]"
HABUDGET_DATA_DIR=./_localdata uvicorn main:app --reload --port 8935
```
