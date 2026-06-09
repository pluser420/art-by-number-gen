FROM node:20-slim

# Install Inkscape and ICC color profiles
RUN apt-get update && apt-get install -y \
    inkscape \
    icc-profiles-free \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .

EXPOSE 3000

CMD ["node", "index.js"]
