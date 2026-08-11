export type UserRole = "owner" | "trainer" | "captain" | "member";
export type UserStatus = "pending" | "approved" | "rejected";
export type TerminType = "training" | "event" | "spieltag";
export type RegistrationStatus = "angemeldet" | "warteliste";

// Plain `type` aliases (not `interface`) so these structurally satisfy the
// Record<string, unknown>-based Row/Insert/Update constraints supabase-js's
// generic PostgrestClient checks against — interfaces don't.
export type Profile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  group_id: string | null;
  status: UserStatus | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  code: string;
  short_code: string | null;
  created_at: string;
};

export type Termin = {
  id: string;
  type: TerminType;
  title: string;
  trainer: string;
  location: string;
  courts: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  description: string;
  max_tn: number;
  price: number | null;
  visible_groups: string[];
  register_groups: string[];
  notify_create: boolean;
  reminder_enabled: boolean;
  registration_opens_date: string | null;
  registration_opens_time: string | null;
  created_by: string | null;
  created_at: string;
};

export type Registration = {
  id: string;
  termin_id: string;
  user_id: string;
  status: RegistrationStatus;
  created_at: string;
};

export type Message = {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type MessageInsert = Pick<Message, "group_id" | "user_id" | "content">;

export type Announcement = {
  id: string;
  content: string;
  visible_groups: string[];
  created_by: string | null;
  created_at: string;
};

type AnnouncementInsert = Pick<Announcement, "content" | "visible_groups" | "created_by">;

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

type PushSubscriptionInsert = Pick<PushSubscriptionRow, "user_id" | "endpoint" | "p256dh" | "auth">;

export type NotificationRecipient = {
  user_id: string;
  name: string;
  email: string;
};

export type PushSubscriptionTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WaitlistPromotionPush = {
  user_id: string;
  termin_id: string;
  title: string;
  date: string;
  start_time: string;
  location: string;
  register_groups: string[];
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
};

export type DueTrainingReminder = {
  termin_id: string;
  title: string;
  date: string;
  start_time: string;
  register_groups: string[];
};

export type ConfirmedPushTarget = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type OpenedRegistrationPush = {
  termin_id: string;
  title: string;
  date: string;
  start_time: string;
  register_groups: string[];
  user_id: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
};

export type IcalEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  start_time: string;
  end_time: string;
};

type TerminInsert = Pick<
  Termin,
  | "type"
  | "title"
  | "trainer"
  | "location"
  | "courts"
  | "date"
  | "start_time"
  | "end_time"
  | "description"
  | "max_tn"
  | "price"
  | "visible_groups"
  | "register_groups"
  | "notify_create"
  | "reminder_enabled"
  | "registration_opens_date"
  | "registration_opens_time"
>;

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: Partial<Profile>;
        Relationships: [];
      };
      groups: {
        Row: Group;
        Insert: Group;
        Update: Partial<Group>;
        Relationships: [];
      };
      termine: {
        Row: Termin;
        Insert: TerminInsert;
        Update: Partial<TerminInsert>;
        Relationships: [];
      };
      registrations: {
        Row: Registration;
        Insert: Registration;
        Update: Partial<Registration>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: MessageInsert;
        Update: never;
        Relationships: [];
      };
      announcements: {
        Row: Announcement;
        Insert: AnnouncementInsert;
        Update: never;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: PushSubscriptionInsert;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_teamcode: { Args: { p_code: string }; Returns: UserStatus };
      retry_code: { Args: Record<string, never>; Returns: void };
      approve_request: { Args: { p_user_id: string }; Returns: void };
      reject_request: { Args: { p_user_id: string }; Returns: void };
      register_for_termin: { Args: { p_termin_id: string }; Returns: RegistrationStatus };
      cancel_registration: { Args: { p_termin_id: string }; Returns: void };
      admin_remove_participant: { Args: { p_termin_id: string; p_user_id: string }; Returns: void };
      admin_add_participant: { Args: { p_termin_id: string; p_user_id: string }; Returns: RegistrationStatus };
      create_group: { Args: { p_name: string; p_short_code?: string | null }; Returns: Group };
      rename_group: { Args: { p_group_id: string; p_name: string; p_short_code?: string | null }; Returns: void };
      remove_group_member: { Args: { p_user_id: string }; Returns: void };
      set_user_role: { Args: { p_user_id: string; p_role: "member" | "trainer" | "captain" }; Returns: void };
      admin_update_profile: { Args: { p_user_id: string; p_name: string; p_group_id: string | null }; Returns: void };
      delete_message: { Args: { p_message_id: string }; Returns: void };
      delete_announcement: { Args: { p_id: string }; Returns: void };
      get_announcement_push_subscriptions: { Args: { p_announcement_id: string }; Returns: PushSubscriptionTarget[] };
      get_my_ical_token: { Args: Record<string, never>; Returns: string };
      get_ical_events: { Args: { p_token: string }; Returns: IcalEvent[] };
      get_termin_notification_recipients: { Args: { p_termin_id: string }; Returns: NotificationRecipient[] };
      get_termin_push_subscriptions: { Args: { p_termin_id: string }; Returns: PushSubscriptionTarget[] };
      admin_delete_push_subscription: { Args: { p_endpoint: string }; Returns: void };
      claim_waitlist_promotions: { Args: Record<string, never>; Returns: WaitlistPromotionPush[] };
      claim_due_training_reminders: { Args: Record<string, never>; Returns: DueTrainingReminder[] };
      get_confirmed_push_subscriptions: { Args: { p_termin_id: string }; Returns: ConfirmedPushTarget[] };
      claim_opened_registrations: { Args: Record<string, never>; Returns: OpenedRegistrationPush[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
