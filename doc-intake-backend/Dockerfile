FROM node:20-slim

WORKDIR /app

# Install deps first (layer caching — deps change less than source)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]