FROM node:14.17.6-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production
RUN apk add --no-cache nodejs npm python3 openjdk11 build-base gcc g++

COPY . .
COPY ./code-execution  /app/sandbox/code-execution
VOLUME /app/sandbox/code-execution

EXPOSE 8000

CMD [ "node", "index.js" ]