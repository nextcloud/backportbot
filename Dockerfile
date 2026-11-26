FROM node:24-alpine

# The bot clones, cherry picks and pushes with git
RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

# Clones, work trees and the log live in /app, keep them writable for the node user
RUN mkdir cache work && chown node:node /app /app/cache /app/work
USER node

EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["npm", "run", "serve"]
