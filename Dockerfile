FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p db
EXPOSE 8080
CMD ["node", "index.js"]
