import { GoogleGenAI } from "@google/genai";
import { KNOWLEDGE_BASE } from "../data/knowledgeBase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function askQuestion(question: string) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a specialized AI assistant for Egyptian Nursing Students.
    Your knowledge is strictly limited to the provided knowledge base which covers:
    1. Fundamental of Nursing (Practical and Theoretical)
    2. Biology (Cell, Genetics, etc.)
    3. Social Studies (Medical Geography)
    
    RULES:
    - Only answer based on the provided Knowledge Base.
    - If the answer is not in the knowledge base, politely state that you can only answer questions related to the nursing curriculum sources provided.
    - Answer in the same language as the user (Arabic or English).
    - Be professional, accurate, and helpful.
    - Use bullet points for steps or lists.
    
    KNOWLEDGE BASE:
    ${KNOWLEDGE_BASE}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: question,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for factual consistency
      },
    });

    return response.text || "Sorry, I couldn't generate an answer.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "An error occurred while trying to fetch the answer. Please check your API key or connection.";
  }
}

export async function summarizeDocument(documentContent: string) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a specialized AI assistant for Egyptian Nursing Students.
    Your task is to summarize documents ONLY if they are related to your core curriculum:
    1. Fundamental of Nursing (Practical and Theoretical)
    2. Biology (Cell, Genetics, etc.)
    3. Social Studies (Medical Geography)
    
    RULES:
    - First, analyze if the document content is related to the nursing curriculum mentioned above.
    - If it IS related: Provide a concise, accurate summary capturing main points and key information using bullet points.
    - If it IS NOT related: Politely refuse to summarize and explain that you are specialized only in the nursing curriculum (Nursing, Biology, Medical Geography).
    - Answer in the same language as the document (Arabic or English).
    - Be professional and helpful.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Please analyze and summarize the following document if it is related to the nursing curriculum:\n\n${documentContent}`,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    return response.text || "عذراً، لم أتمكن من إنشاء ملخص.";
  } catch (error) {
    console.error("Error calling Gemini for summary:", error);
    return "حدث خطأ أثناء محاولة إنشاء الملخص. يرجى التحقق من الاتصال.";
  }
}
