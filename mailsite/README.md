# TIES Mail — webmail frontend (mail.tiesverse.com)

A standalone Vite + React app that signs in against this same backend and talks
to `mail_app`. Kept in this repo so the frontend and its API live together.

Build and deploy:

    npm install
    npm run build
    # scp dist/* to the VPS at /opt/mailsite/dist (nginx serves it)

Dev server runs on port 5176 (admin uses 5173/5174, docs 5175).
