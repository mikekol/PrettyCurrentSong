FROM nginx:alpine
COPY public/ /usr/share/nginx/html/
COPY config.js.template /etc/nginx/config-templates/config.js.template
COPY docker-entrypoint.d/40-generate-config.sh /docker-entrypoint.d/40-generate-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
