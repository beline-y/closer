export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          emoji: string
          id: string
          instructions: string | null
          minutes: number
          quiz: Json | null
          steps: string[]
          theme: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          instructions?: string | null
          minutes?: number
          quiz?: Json | null
          steps?: string[]
          theme?: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          instructions?: string | null
          minutes?: number
          quiz?: Json | null
          steps?: string[]
          theme?: string | null
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
        }
        Relationships: []
      }
      activity_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reactions: {
        Row: {
          created_at: string
          emoji: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sessions: {
        Row: {
          activity_id: string
          completed_at: string | null
          created_at: string
          id: string
          in_memories: boolean
          local_date: string
          partner_id: string | null
          patient_id: string
          result_path: string | null
          result_text: string | null
          score: number | null
          score_total: number | null
          status: Database["public"]["Enums"]["activity_status"]
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Insert: {
          activity_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          in_memories?: boolean
          local_date?: string
          partner_id?: string | null
          patient_id: string
          result_path?: string | null
          result_text?: string | null
          score?: number | null
          score_total?: number | null
          status?: Database["public"]["Enums"]["activity_status"]
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Update: {
          activity_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          in_memories?: boolean
          local_date?: string
          partner_id?: string | null
          patient_id?: string
          result_path?: string | null
          result_text?: string | null
          score?: number | null
          score_total?: number | null
          status?: Database["public"]["Enums"]["activity_status"]
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_unit_members: {
        Row: {
          unit_id: string
          user_id: string
        }
        Insert: {
          unit_id: string
          user_id: string
        }
        Update: {
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_unit_members_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "care_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_unit_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_units: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      challenge_entries: {
        Row: {
          completed_at: string | null
          created_at: string
          result_path: string | null
          result_text: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          result_path?: string | null
          result_text?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          result_path?: string | null
          result_text?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "activity_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_photos: {
        Row: {
          checkin_id: string
          created_at: string
          id: string
          path: string
          patient_id: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          id?: string
          path: string
          patient_id: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          id?: string
          path?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_photos_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "mood_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_reactions: {
        Row: {
          checkin_id: string
          created_at: string
          emoji: string
          user_id: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          emoji: string
          user_id: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          emoji?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_reactions_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "mood_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_ratings: {
        Row: {
          amount: Database["public"]["Enums"]["meal_amount"] | null
          checkin_id: string
          created_at: string
          liking: number | null
          menu_item_id: string
          patient_id: string
        }
        Insert: {
          amount?: Database["public"]["Enums"]["meal_amount"] | null
          checkin_id: string
          created_at?: string
          liking?: number | null
          menu_item_id: string
          patient_id: string
        }
        Update: {
          amount?: Database["public"]["Enums"]["meal_amount"] | null
          checkin_id?: string
          created_at?: string
          liking?: number | null
          menu_item_id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_ratings_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "mood_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_ratings_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_ratings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          created_by: string | null
          dish_name: string
          icon: string
          id: string
          meal: Database["public"]["Enums"]["meal_kind"]
          menu_date: string
          position: number
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dish_name: string
          icon?: string
          id?: string
          meal: Database["public"]["Enums"]["meal_kind"]
          menu_date: string
          position?: number
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dish_name?: string
          icon?: string
          id?: string
          meal?: Database["public"]["Enums"]["meal_kind"]
          menu_date?: string
          position?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "care_units"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          activities: Database["public"]["Enums"]["activity_kind"][]
          activity_note: string | null
          created_at: string
          id: string
          local_date: string
          meal_amount: Database["public"]["Enums"]["meal_amount"] | null
          meal_note: string | null
          meals: Database["public"]["Enums"]["meal_kind"][]
          mood: number
          note: string | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          activities?: Database["public"]["Enums"]["activity_kind"][]
          activity_note?: string | null
          created_at?: string
          id?: string
          local_date?: string
          meal_amount?: Database["public"]["Enums"]["meal_amount"] | null
          meal_note?: string | null
          meals?: Database["public"]["Enums"]["meal_kind"][]
          mood: number
          note?: string | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          activities?: Database["public"]["Enums"]["activity_kind"][]
          activity_note?: string | null
          created_at?: string
          id?: string
          local_date?: string
          meal_amount?: Database["public"]["Enums"]["meal_amount"] | null
          meal_note?: string | null
          meals?: Database["public"]["Enums"]["meal_kind"][]
          mood?: number
          note?: string | null
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_checkins_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      nudge_recipients: {
        Row: {
          nudge_id: string
          replied_at: string | null
          reply_emoji: string | null
          reply_text: string | null
          seen_at: string | null
          user_id: string
        }
        Insert: {
          nudge_id: string
          replied_at?: string | null
          reply_emoji?: string | null
          reply_text?: string | null
          seen_at?: string | null
          user_id: string
        }
        Update: {
          nudge_id?: string
          replied_at?: string | null
          reply_emoji?: string | null
          reply_text?: string | null
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudge_recipients_nudge_id_fkey"
            columns: ["nudge_id"]
            isOneToOne: false
            referencedRelation: "nudges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudge_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nudges: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["nudge_kind"]
          patient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["nudge_kind"]
          patient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["nudge_kind"]
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudges_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_links: {
        Row: {
          approved_by: string | null
          created_at: string
          id: string
          invite_id: string | null
          is_guardian: boolean
          patient_id: string
          relationship: string | null
          role: Database["public"]["Enums"]["link_role"]
          status: Database["public"]["Enums"]["link_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          id?: string
          invite_id?: string | null
          is_guardian?: boolean
          patient_id: string
          relationship?: string | null
          role: Database["public"]["Enums"]["link_role"]
          status?: Database["public"]["Enums"]["link_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          id?: string
          invite_id?: string | null
          is_guardian?: boolean
          patient_id?: string
          relationship?: string | null
          role?: Database["public"]["Enums"]["link_role"]
          status?: Database["public"]["Enums"]["link_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_links_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_settings: {
        Row: {
          low_mood_streak: number
          low_mood_threshold: number
          no_checkin_days: number
          no_family_contact_days: number
          nudge_cooldown_minutes: number
          patient_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          low_mood_streak?: number
          low_mood_threshold?: number
          no_checkin_days?: number
          no_family_contact_days?: number
          nudge_cooldown_minutes?: number
          patient_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          low_mood_streak?: number
          low_mood_threshold?: number
          no_checkin_days?: number
          no_family_contact_days?: number
          nudge_cooldown_minutes?: number
          patient_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_settings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_year: number | null
          created_at: string
          created_by: string | null
          id: string
          interests: string[]
          is_minor: boolean
          login_code: string | null
          nickname: string
          status: Database["public"]["Enums"]["patient_status"]
          timezone: string
          unit_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          interests?: string[]
          is_minor?: boolean
          login_code?: string | null
          nickname: string
          status?: Database["public"]["Enums"]["patient_status"]
          timezone?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          interests?: string[]
          is_minor?: boolean
          login_code?: string | null
          nickname?: string
          status?: Database["public"]["Enums"]["patient_status"]
          timezone?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "care_units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activity_counts: {
        Args: { p_days?: number; p_patient_id: string }
        Returns: {
          completed: number
          local_date: string
        }[]
      }
      my_pending_challenges: {
        Args: never
        Returns: {
          activity_id: string
          created_at: string
          emoji: string
          patient_id: string
          session_id: string
          theme: string
          title: string
        }[]
      }
      send_nudge: {
        Args: {
          p_kind: Database["public"]["Enums"]["nudge_kind"]
          p_recipients?: string[]
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "patient" | "family" | "care_team" | "volunteer"
      activity_kind:
        | "played"
        | "movie"
        | "drew"
        | "school"
        | "visit"
        | "treatment"
        | "rested"
        | "walk"
      activity_status: "started" | "waiting_partner" | "completed"
      activity_type: "draw" | "make_snap" | "quiz" | "story" | "challenge"
      activity_visibility: "private" | "family"
      link_role: "care_team" | "family" | "friend" | "volunteer"
      link_status: "pending" | "active" | "revoked"
      meal_amount: "all" | "half" | "a_little"
      meal_kind: "breakfast" | "lunch" | "dinner" | "snack"
      nudge_kind: "miss_you" | "call_me" | "bored" | "proud" | "hug"
      patient_status: "pending_consent" | "active" | "discharged"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["patient", "family", "care_team", "volunteer"],
      activity_kind: [
        "played",
        "movie",
        "drew",
        "school",
        "visit",
        "treatment",
        "rested",
        "walk",
      ],
      activity_status: ["started", "waiting_partner", "completed"],
      activity_type: ["draw", "make_snap", "quiz", "story", "challenge"],
      activity_visibility: ["private", "family"],
      link_role: ["care_team", "family", "friend", "volunteer"],
      link_status: ["pending", "active", "revoked"],
      meal_amount: ["all", "half", "a_little"],
      meal_kind: ["breakfast", "lunch", "dinner", "snack"],
      nudge_kind: ["miss_you", "call_me", "bored", "proud", "hug"],
      patient_status: ["pending_consent", "active", "discharged"],
    },
  },
} as const
