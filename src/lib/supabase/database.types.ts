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
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      link_role: ["care_team", "family", "friend", "volunteer"],
      link_status: ["pending", "active", "revoked"],
      meal_amount: ["all", "half", "a_little"],
      meal_kind: ["breakfast", "lunch", "dinner", "snack"],
      nudge_kind: ["miss_you", "call_me", "bored", "proud", "hug"],
      patient_status: ["pending_consent", "active", "discharged"],
    },
  },
} as const
