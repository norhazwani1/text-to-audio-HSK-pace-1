
export default async (req) => {
  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const accessCode = process.env.TEACHER_ACCESS_CODE;

  if (!apiKey || !accessCode) {
    return Response.json(
      { error: "Server configuration is incomplete." },
      { status: 500 }
    );
  }

  if (
    req.headers.get("x-teacher-code") !== accessCode
  ) {
    return Response.json(
      { error: "Kod akses guru tidak sah." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const text =
      typeof body.text === "string"
        ? body.text.trim()
        : "";
    const gender = body.gender;

    if (!text || text.length > 2000) {
      return Response.json(
        { error: "Teks mesti mengandungi 1–2000 aksara." },
        { status: 400 }
      );
    }

    if (!["female", "male"].includes(gender)) {
      return Response.json(
        { error: "Pilihan suara tidak sah." },
        { status: 400 }
      );
    }

    const voiceName =
      gender === "male" ? "Charon" : "Kore";

    const voiceDescription =
      gender === "male"
        ? "Use a clear adult male voice."
        : "Use a clear adult female voice.";

    const prompt =
      `Read in Standard Mandarin (标准普通话). ` +
      `${voiceDescription} Speak slowly and clearly ` +
      `for HSK 1 learners. Read exactly the following ` +
      `text without translating or adding words:\n${text}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }] }
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName
                }
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        data
      );

      return Response.json(
        {
          error:
            response.status === 429
              ? "Had penggunaan Gemini dicapai. Cuba lagi kemudian."
              : "Audio Gemini gagal dijana."
        },
        {
          status: response.status === 429 ? 429 : 502
        }
      );
    }

    const audioPart =
      data.candidates?.[0]?.content?.parts?.find(
        part => part.inlineData?.data
      );

    if (!audioPart) {
      return Response.json(
        { error: "Gemini tidak memulangkan audio." },
        { status: 502 }
      );
    }

    return Response.json({
      audio: audioPart.inlineData.data,
      mimeType:
        audioPart.inlineData.mimeType || "audio/pcm"
    });
  } catch (error) {
    console.error("TTS function error:", error);

    return Response.json(
      { error: "Ralat server ketika menjana audio." },
      { status: 500 }
    );
  }
};

