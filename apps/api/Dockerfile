# Grow|Observer API
FROM node:20
WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install

# Source
COPY . .

EXPOSE 8787

# Migrationen generieren + ausführen, seeden, dann Dev-Server starten.
# Für Production: `npm run build` + `npm start` nutzen.
CMD ["sh", "-c", "npm run db:generate && npm run db:migrate && npm run db:seed && npm run dev"]
