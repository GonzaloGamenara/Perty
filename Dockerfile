# Imagen para plataformas que corren un proceso persistente (Fly, Railway, VPS).
# En Render alcanza con el build/start command: no hace falta esto.
FROM node:22-alpine

WORKDIR /app

# El lockfile y todos los package.json del workspace primero, para que la capa
# de dependencias se reuse mientras solo cambie el código.
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/engine/package.json packages/engine/
COPY packages/games/package.json packages/games/
COPY apps/server/package.json apps/server/
COPY apps/host/package.json apps/host/
COPY apps/controller/package.json apps/controller/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
