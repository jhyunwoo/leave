// 외부 Resend만 대체한다. 인증·SQL·세션은 실제 Worker/D1을 사용한다.
import { createServer } from "node:http";

export function startMailServer(port) {
  const messages = [];
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET") {
      const email = new URL(request.url, "http://localhost").searchParams.get(
        "email",
      );
      response.end(
        JSON.stringify(messages.filter((m) => m.to.includes(email))),
      );
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const mail = JSON.parse(body);
    if (
      request.headers.authorization !== "Bearer test-resend-key" ||
      !mail.from ||
      !mail.text ||
      !mail.html ||
      !request.headers["idempotency-key"]
    ) {
      response.statusCode = 400;
      response.end(JSON.stringify({ message: "Invalid send request" }));
      return;
    }
    if (mail.to.some((email) => email.startsWith("mail-failure"))) {
      response.statusCode = 503;
      response.end(JSON.stringify({ message: "Private provider error" }));
      return;
    }
    messages.push(mail);
    response.end(JSON.stringify({ id: crypto.randomUUID() }));
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server)),
  );
}
