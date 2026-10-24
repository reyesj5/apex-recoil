# Deploy a code

1. `pnpm static`

2.  scp -r -i <id_rsa> .\static\* [DEPLOY USER]@[DEPLOY HOST]:[WEB ROOT]

# Update domains

1. edit /etc/nginx/sites-enabled/default
add section

```
server {
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    server_name [DOMAIN];
    # Compress text only: images and audio are compressed already. For brotli, as the Express
    # server sends, install the nginx brotli module (Debian and Ubuntu package
    # libnginx-mod-http-brotli-filter) and add: brotli on; brotli_types <the same types>;
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml application/xml;

    # Every page is a folder with an index.html (patterns/, ru/progress/); an address the site
    # doesn't have gets the 404 page
    error_page 404 /404.html;
    location / {
        # First attempt to serve request as file, then
        # as directory, then fall back to displaying a 404.
        try_files $uri $uri/ =404;
    }
    # Chunk file names carry a content hash: browsers keep them for a year
    location ^~ /chunks/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
    # Pages and the entry files that keep their names (trainer.js, patterns.js, progress.js,
    # docs.js, editor.js, app.css, tailwind.css): browsers check for a new version every time
    location ~* \.(html|js|css)$ {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }
    # /ru and /zh-CN from index-ru.html and index-zh-CN.html, as before the new pages; ru/index.html
    # and zh-CN/index.html hold the same pages, so these two blocks may also go
    location ~ ^/ru/?$ {
       rewrite ^/ru/?(.*)$ /$1 break;
       index index-ru.html;
       try_files $uri $uri/ =404;
    }
    location ~ ^/zh-CN/?$ {
       rewrite ^/zh-CN/?(.*)$ /$1 break;
       index index-zh-CN.html;
       try_files $uri $uri/ =404;
    }
    listen 80;
}
```

2. run `nginx -t` to test and `systemctl restart nginx`

3. check that http://[DOMAIN]/ is available

4. run `certbot --nginx` and select new domain