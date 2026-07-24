import { describe, it, expect } from "vitest";
import type { Memory, User } from "@prisma/client";
import { buildSystemPrompt } from "@/prompts/system";

const USER: User = {
  id: "user-1",
  lineUserId: "U123",
  displayName: "Test User",
  pictureUrl: null,
  role: "USER",
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const prompt = buildSystemPrompt(USER, []);

describe("system prompt — weather/AQI advisory guidance (M5)", () => {
  it("instructs Nova to always call the weather/AQI tools before answering, never guess", () => {
    expect(prompt).toContain("ห้ามตอบจากความรู้ทั่วไปหรือเดาสภาพอากาศ");
  });

  it("covers every example advisory question from the milestone", () => {
    const questions = [
      "วิ่งได้ไหม",
      "ควรพกร่มไหม",
      "เปิดหน้าต่างได้ไหม",
      "ซักผ้าได้ไหม",
      "ขี่มอเตอร์ไซค์ไหม",
      "เดินเล่นได้ไหม",
      "พาเด็กออกไปข้างนอกไหม",
      "แดดแรงไหม",
      "UV สูงไหม",
      "ฝุ่นอันตรายไหม",
    ];
    for (const q of questions) {
      expect(prompt).toContain(q);
    }
  });

  it("lists all required reasoning factors: temperature, humidity, rain, wind, AQI, PM2.5, UV", () => {
    for (const factor of [
      "อุณหภูมิ",
      "ความชื้น",
      "ฝน",
      "ลม",
      "AQI",
      "PM2.5",
      "UV",
    ]) {
      expect(prompt).toContain(factor);
    }
  });

  it("defines the US EPA AQI scale so Gemini can categorize aqiUs", () => {
    expect(prompt).toContain("Good");
    expect(prompt).toContain("Moderate");
    expect(prompt).toContain("Unhealthy for Sensitive Groups");
    expect(prompt).toContain("Very Unhealthy");
    expect(prompt).toContain("Hazardous");
  });

  it("keeps reasoning in Gemini rather than hardcoded tool responses", () => {
    expect(prompt).toContain(
      "Nova เป็นคนวิเคราะห์และให้คำแนะนำเอง (reasoning อยู่ที่ Gemini ไม่ใช่ในตัว tool)",
    );
  });

  it("requires advice to include a concise reason", () => {
    expect(prompt).toContain("พร้อมเหตุผลสั้น ๆ ต่อท้ายเสมอ");
  });

  it("forbids inventing missing data (e.g. UV when unavailable)", () => {
    expect(prompt).toContain("ห้ามสมมติหรือเดาค่าใด ๆ ทั้งสิ้น");
    expect(prompt).toContain("บอกผู้ใช้ตรง ๆ ว่าตอนนี้ไม่มีข้อมูลนี้");
  });

  it("forbids medical diagnosis and steers toward general practical advice", () => {
    expect(prompt).toContain("ห้ามวินิจฉัยหรือให้คำแนะนำทางการแพทย์");
  });

  it("tells Nova which tool(s) to call for weather vs air-quality factors", () => {
    expect(prompt).toContain("get_weather สำหรับอุณหภูมิ");
    expect(prompt).toContain("weather สำหรับ AQI/PM2.5/PM10");
  });
});
