# Stage 1: Build TypeScript
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies for TypeScript)
COPY package.json ./
RUN npm install

# Copy source code and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript from build stage
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
