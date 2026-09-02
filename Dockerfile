FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY config/example.json ./config/example.json
COPY README.md CHATGPT_WEB_SETUP.md ACCEPTANCE_CRITERIA.md ./

RUN mkdir -p /app/runtime /app/outgoing /app/private/resumes

ENV QQ_MAIL_ASSISTANT_HOST=0.0.0.0
ENV QQ_MAIL_ASSISTANT_PORT=3050
EXPOSE 3050

CMD ["node", "src/server.cjs"]
