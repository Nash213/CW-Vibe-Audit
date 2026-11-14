FROM node:26-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev
# After running `npm install --package-lock-only` locally, you can use:
# RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["node", "src/server.js"]
