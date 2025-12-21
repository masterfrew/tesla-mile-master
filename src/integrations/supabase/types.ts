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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      encrypted_tesla_tokens: {
        Row: {
          created_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          encryption_version: number | null
          id: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          encryption_version?: number | null
          id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          encryption_version?: number | null
          id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_sheets_integrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          sheet_id: string
          sheet_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sheet_id: string
          sheet_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sheet_id?: string
          sheet_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mileage_readings: {
        Row: {
          created_at: string
          daily_km: number | null
          id: string
          location_name: string | null
          metadata: Json | null
          odometer_km: number
          reading_date: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          daily_km?: number | null
          id?: string
          location_name?: string | null
          metadata?: Json | null
          odometer_km: number
          reading_date: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          daily_km?: number | null
          id?: string
          location_name?: string | null
          metadata?: Json | null
          odometer_km?: number
          reading_date?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_pkce_state: {
        Row: {
          code_verifier: string
          created_at: string
          nonce: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          nonce: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          nonce?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          subscription_tier: string | null
          tesla_access_token: string | null
          tesla_refresh_token: string | null
          tesla_token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          subscription_tier?: string | null
          tesla_access_token?: string | null
          tesla_refresh_token?: string | null
          tesla_token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          subscription_tier?: string | null
          tesla_access_token?: string | null
          tesla_refresh_token?: string | null
          tesla_token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          created_at: string
          description: string | null
          end_lat: number | null
          end_location: string | null
          end_lon: number | null
          end_odometer_km: number | null
          ended_at: string | null
          id: string
          is_manual: boolean | null
          metadata: Json | null
          purpose: string | null
          start_lat: number | null
          start_location: string | null
          start_lon: number | null
          start_odometer_km: number
          started_at: string
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_lat?: number | null
          end_location?: string | null
          end_lon?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          is_manual?: boolean | null
          metadata?: Json | null
          purpose?: string | null
          start_lat?: number | null
          start_location?: string | null
          start_lon?: number | null
          start_odometer_km: number
          started_at: string
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_lat?: number | null
          end_location?: string | null
          end_lon?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          is_manual?: boolean | null
          metadata?: Json | null
          purpose?: string | null
          start_lat?: number | null
          start_location?: string | null
          start_lon?: number | null
          start_odometer_km?: number
          started_at?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_sync_status: {
        Row: {
          consecutive_failures: number | null
          created_at: string
          id: string
          is_offline: boolean | null
          last_error: string | null
          last_successful_sync: string | null
          last_sync_attempt: string | null
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string
          id?: string
          is_offline?: boolean | null
          last_error?: string | null
          last_successful_sync?: string | null
          last_sync_attempt?: string | null
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string
          id?: string
          is_offline?: boolean | null
          last_error?: string | null
          last_successful_sync?: string | null
          last_sync_attempt?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_sync_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean | null
          model: string | null
          tesla_vehicle_id: number
          updated_at: string
          user_id: string
          vin: string
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          tesla_vehicle_id: number
          updated_at?: string
          user_id: string
          vin: string
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          tesla_vehicle_id?: number
          updated_at?: string
          user_id?: string
          vin?: string
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_pkce_states: { Args: never; Returns: undefined }
      cleanup_expired_tesla_tokens: { Args: never; Returns: undefined }
      cleanup_old_pkce_states: { Args: never; Returns: undefined }
      clear_encrypted_tesla_tokens: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      get_admin_stats: {
        Args: never
        Returns: {
          active_today: number
          total_mileage_readings: number
          total_users: number
          total_vehicles: number
          users_with_tesla: number
        }[]
      }
      get_all_users: {
        Args: never
        Returns: {
          company_name: string
          created_at: string
          email: string
          first_name: string
          has_tesla_connected: boolean
          last_name: string
          subscription_tier: string
          user_id: string
          vehicle_count: number
        }[]
      }
      get_encrypted_tesla_tokens: {
        Args: { p_user_id: string }
        Returns: {
          encrypted_access_token: string
          encrypted_refresh_token: string
          token_expires_at: string
        }[]
      }
      get_tesla_access_token: { Args: { p_user_id: string }; Returns: string }
      get_tesla_refresh_token: { Args: { p_user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tesla_token_expired: { Args: { p_user_id: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_type: string
          p_user_id: string
        }
        Returns: string
      }
      mark_token_refresh_needed: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      store_encrypted_tesla_tokens: {
        Args: {
          p_encrypted_access_token: string
          p_encrypted_refresh_token: string
          p_expires_at: string
          p_user_id: string
        }
        Returns: undefined
      }
      store_tesla_tokens: {
        Args: {
          p_access_token: string
          p_expires_at: string
          p_refresh_token: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
