FROM node:11

WORKDIR /app
COPY package* /app/
RUN npm install --production
COPY . /app/
EXPOSE 8080
ENTRYPOINT [ "npx",  "probot", "run", "./index.js" ]
