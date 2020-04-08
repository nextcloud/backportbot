FROM nextcloudci/node:node-7

RUN apk add python

WORKDIR /app
COPY . .
RUN npm install --production

ENTRYPOINT ["npm", "run", "start"]
