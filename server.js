// Relay Twilio WhatsApp <-> Copilot Studio (Direct Line)
// Demo ONP - version gratis. No requiere base de datos.
 
const express = require("express");
const twilio = require("twilio");
 
const app = express();
app.use(express.urlencoded({ extended: false }));
 
// URL del token de Direct Line de tu agente
const TOKEN_URL =
  "https://default59eb295bef81470888885756316215.ab.environment
.api.powerplatform.com/powervirtualagents/botsbyschema/
cr712_AGENTEORQUESTADORONP/directline/token
?api-version=2022-03-01-preview";
 
const DL_BASE = "https://directline.botframework.com/v3/directline";
 
// Memoria simple por numero de WhatsApp (suficiente para demo)
const sessions = {};
 
// Limpia HTML/Markdown que WhatsApp no renderiza
function toPlainText(s) {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .trim();
}
 
async function getDirectLineToken() {
  const r = await fetch(TOKEN_URL);
  const data = await r.json();
  return data.token;
}
 
async function startConversation(token) {
  const r = await fetch(`${DL_BASE}/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  return data.conversationId;
}
 
async function sendToAgent(token, conversationId, text, from) {
  await fetch(`${DL_BASE}/conversations/${conversationId}/activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "message",
      from: { id: from },
      text,
    }),
  });
}
 
// Recoge la respuesta del agente con polling al watermark
async function getAgentReply(token, conversationId, watermark) {
  await new Promise((res) => setTimeout(res, 1500));
  const url = watermark
    ? `${DL_BASE}/conversations/${conversationId}
/activities?watermark=${watermark}`
    : `${DL_BASE}/conversations/${conversationId}/activities`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  const botMessages = (data.activities || [])
    .filter((a) => a.type === "message" && a.from 
      && a.from.id !== "user")
    .map((a) => toPlainText(a.text))
    .filter(Boolean);
  return { reply: botMessages.join("\n\n"), 
    watermark: data.watermark };
}
 
app.post("/whatsapp", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const from = req.body.From;
  const userText = req.body.Body || "";
  try {
    let s = sessions[from];
    if (!s) {
      const token = await getDirectLineToken();
      const conversationId = await startConversation(token);
      s = { token, conversationId, watermark: null };
      sessions[from] = s;
    }
    await sendToAgent(s.token, s.conversationId, userText, "user");
    const { reply, watermark } = await getAgentReply(
      s.token, s.conversationId, s.watermark);
    s.watermark = watermark;
    twiml.message(reply || 
      "El agente no devolvio respuesta. Intenta de nuevo.");
  } catch (e) {
    console.error(e);
    delete sessions[from];
    twiml.message("Hubo un problema temporal. 
      Escribe de nuevo, por favor.");
  }
  res.type("text/xml").send(twiml.toString());
});
 
app.get("/", (_req, res) => res.send("Relay ONP activo"));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Relay en ${PORT}`));
