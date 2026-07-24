import { getConfig } from "@/lib/config";
import { getPrisma } from "@/lib/prisma";
import { LineService } from "@/lib/line";
import { UserRepository } from "@/repositories/user.repository";
import { ConversationRepository } from "@/repositories/conversation.repository";
import { MemoryRepository } from "@/repositories/memory.repository";
import { TodoRepository } from "@/repositories/todo.repository";
import { ReminderRepository } from "@/repositories/reminder.repository";
import { CalendarEventRepository } from "@/repositories/calendar-event.repository";
import { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import { SettingsRepository } from "@/repositories/settings.repository";
import { UserSettingsRepository } from "@/repositories/user-settings.repository";
import { LocationRepository } from "@/repositories/location.repository";
import { WeatherAlertRepository } from "@/repositories/weather-alert.repository";
import { GeminiService } from "@/services/gemini.service";
import { EmbeddingService } from "@/services/embedding.service";
import { MemoryService } from "@/services/memory.service";
import { TodoService } from "@/services/todo.service";
import { ReminderService } from "@/services/reminder.service";
import { CalendarService } from "@/services/calendar.service";
import { NewsService } from "@/services/news.service";
import { WeatherService } from "@/services/weather.service";
import { AirVisualService } from "@/services/airvisual.service";
import { LocationService } from "@/services/location.service";
import { WeatherAlertService } from "@/services/weather-alert.service";
import { GeocodingService } from "@/services/geocoding.service";
import { NominatimProvider } from "@/services/geocoding/nominatim.provider";
import { SettingsService } from "@/services/settings.service";
import { QuickCommandService } from "@/services/quick-command.service";
import { BriefService } from "@/services/brief.service";
import { UserService } from "@/services/user.service";
import { ChatService } from "@/services/chat.service";
import { WebhookService } from "@/services/webhook.service";
import type { ToolServices } from "@/types";

/**
 * Composition root — wires repositories and services once per runtime.
 * Everything downstream receives dependencies via constructor injection.
 */
export interface Container {
  line: LineService;
  userRepository: UserRepository;
  userService: UserService;
  chatService: ChatService;
  webhookService: WebhookService;
  reminderService: ReminderService;
  briefService: BriefService;
  calendarService: CalendarService;
  airvisualService: AirVisualService;
  weatherAlertService: WeatherAlertService;
}

let container: Container | null = null;

export function getContainer(): Container {
  if (container) return container;

  const config = getConfig();
  const prisma = getPrisma();

  // Infrastructure
  const line = new LineService(config.line.channelAccessToken);

  // Repositories
  const userRepo = new UserRepository(prisma);
  const conversationRepo = new ConversationRepository(prisma);
  const memoryRepo = new MemoryRepository(prisma);
  const todoRepo = new TodoRepository(prisma);
  const reminderRepo = new ReminderRepository(prisma);
  const calendarEventRepo = new CalendarEventRepository(prisma);
  const newsPrefRepo = new NewsPreferenceRepository(prisma);
  const settingsRepo = new SettingsRepository(prisma);
  const userSettingsRepo = new UserSettingsRepository(prisma);
  const locationRepo = new LocationRepository(prisma);
  const weatherAlertRepo = new WeatherAlertRepository(prisma);

  // Services
  const gemini = new GeminiService(config.gemini.apiKey, config.gemini.model);
  const embedding = new EmbeddingService(config.gemini.apiKey);
  const memoryService = new MemoryService(memoryRepo, embedding);
  const todoService = new TodoService(todoRepo);
  const reminderService = new ReminderService(reminderRepo, line);
  const calendarService = new CalendarService(
    settingsRepo,
    calendarEventRepo,
    config.google,
    config.line.channelSecret,
  );
  const newsService = new NewsService();
  const weatherService = new WeatherService(config.weather);
  const airvisualService = new AirVisualService(config.airvisual.apiKey);
  const locationService = new LocationService(locationRepo);
  const geocodingService = new GeocodingService(new NominatimProvider());
  const weatherAlertService = new WeatherAlertService(
    weatherAlertRepo,
    locationService,
    airvisualService,
    line,
  );
  const settingsService = new SettingsService(userSettingsRepo);

  const toolServices: ToolServices = {
    memory: memoryService,
    todo: todoService,
    reminder: reminderService,
    calendar: calendarService,
    news: newsService,
    newsPrefs: newsPrefRepo,
    weather: weatherService,
    location: locationService,
    airvisual: airvisualService,
    geocoding: geocodingService,
    weatherAlert: weatherAlertService,
  };

  const quickCommandService = new QuickCommandService(
    todoService,
    reminderService,
    memoryService,
    calendarService,
    newsPrefRepo,
    settingsService,
  );

  const userService = new UserService(userRepo, line, config.auth);
  const chatService = new ChatService(
    conversationRepo,
    gemini,
    memoryService,
    toolServices,
  );
  const webhookService = new WebhookService(
    line,
    userService,
    chatService,
    reminderService,
    quickCommandService,
  );
  const briefService = new BriefService(
    userRepo,
    todoRepo,
    reminderRepo,
    newsPrefRepo,
    newsService,
    calendarService,
    weatherService,
    settingsService,
    line,
  );

  container = {
    line,
    userRepository: userRepo,
    userService,
    chatService,
    webhookService,
    reminderService,
    briefService,
    calendarService,
    airvisualService,
    weatherAlertService,
  };
  return container;
}
