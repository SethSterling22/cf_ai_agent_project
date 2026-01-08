# Usamos una imagen ligera de Node.js
FROM node:20-slim

# Instalamos dependencias básicas del sistema
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Establecemos el directorio de trabajo
WORKDIR /app

# Instalamos Wrangler de forma global
RUN npm install -g wrangler

# Copiamos los archivos de dependencias primero (para aprovechar el cache de capas)
COPY package*.json ./

# Instalamos las dependencias del proyecto
RUN npm install

# Copiamos el resto del código del proyecto
COPY . .

# Exponemos el puerto 8787 que es el que usa wrangler dev por defecto
EXPOSE 8787

# Comando por defecto para iniciar el entorno de desarrollo
# Usamos 0.0.0.0 para que sea accesible desde fuera del contenedor
CMD ["wrangler", "dev", "--ip", "0.0.0.0"]