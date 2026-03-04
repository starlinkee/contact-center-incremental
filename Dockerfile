FROM node:20-alpine

WORKDIR /app

# Install build deps for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Build Tailwind CSS
RUN npx @tailwindcss/cli -i ./src/views/input.css -o ./src/public/styles.css --minify

EXPOSE 3000

CMD ["node", "src/app.js"]
