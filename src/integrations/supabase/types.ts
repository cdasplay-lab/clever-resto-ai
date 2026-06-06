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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          latency_ms: number | null
          model: string | null
          payload: Json | null
          restaurant_id: string | null
          step: number
          tokens_used: number | null
          tool_name: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          latency_ms?: number | null
          model?: string | null
          payload?: Json | null
          restaurant_id?: string | null
          step?: number
          tokens_used?: number | null
          tool_name?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          payload?: Json | null
          restaurant_id?: string | null
          step?: number
          tokens_used?: number | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          label: string | null
          last_used_at: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          label?: string | null
          last_used_at?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string | null
          last_used_at?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      bad_responses: {
        Row: {
          context_json: Json
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          message_id: string | null
          note: string | null
          reason: string
          restaurant_id: string
        }
        Insert: {
          context_json?: Json
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          reason: string
          restaurant_id: string
        }
        Update: {
          context_json?: Json
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          reason?: string
          restaurant_id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          current_prep_minutes: number | null
          delivery_areas: Json
          google_maps_url: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          min_order: number
          name: string
          open_hours: Json
          phone: string | null
          restaurant_id: string
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          current_prep_minutes?: number | null
          delivery_areas?: Json
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          min_order?: number
          name: string
          open_hours?: Json
          phone?: string | null
          restaurant_id: string
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          current_prep_minutes?: number | null
          delivery_areas?: Json
          google_maps_url?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          min_order?: number
          name?: string
          open_hours?: Json
          phone?: string | null
          restaurant_id?: string
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          customer_handle: string
          customer_name: string | null
          error: string | null
          external_chat_id: string | null
          id: string
          rendered_message: string | null
          restaurant_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          customer_handle: string
          customer_name?: string | null
          error?: string | null
          external_chat_id?: string | null
          id?: string
          rendered_message?: string | null
          restaurant_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          customer_handle?: string
          customer_name?: string | null
          error?: string | null
          external_chat_id?: string | null
          id?: string
          rendered_message?: string | null
          restaurant_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          items: Json
          name: string
          price: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          items?: Json
          name: string
          price?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          items?: Json
          name?: string
          price?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          channel: string | null
          conversation_id: string | null
          created_at: string
          customer_handle: string | null
          customer_name: string | null
          id: string
          note: string
          order_id: string | null
          restaurant_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          id?: string
          note: string
          order_id?: string | null
          restaurant_id: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          id?: string
          note?: string
          order_id?: string | null
          restaurant_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          cart: Json
          channel: Database["public"]["Enums"]["channel_type"]
          created_at: string
          customer_handle: string | null
          customer_name: string | null
          delivery: Json
          external_chat_id: string
          id: string
          is_bot_paused: boolean
          last_message_at: string
          meta: Json
          restaurant_id: string
          state: Database["public"]["Enums"]["conversation_state"]
        }
        Insert: {
          assigned_to?: string | null
          cart?: Json
          channel: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          delivery?: Json
          external_chat_id: string
          id?: string
          is_bot_paused?: boolean
          last_message_at?: string
          meta?: Json
          restaurant_id: string
          state?: Database["public"]["Enums"]["conversation_state"]
        }
        Update: {
          assigned_to?: string | null
          cart?: Json
          channel?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          delivery?: Json
          external_chat_id?: string
          id?: string
          is_bot_paused?: boolean
          last_message_at?: string
          meta?: Json
          restaurant_id?: string
          state?: Database["public"]["Enums"]["conversation_state"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_memory: {
        Row: {
          auto_preferences: Json
          channel: string
          created_at: string
          customer_handle: string
          customer_name: string | null
          id: string
          last_address: string | null
          last_order_at: string | null
          last_phone: string | null
          lifetime_value: number
          notes: string | null
          preferences: string | null
          restaurant_id: string
          total_orders: number
          updated_at: string
        }
        Insert: {
          auto_preferences?: Json
          channel: string
          created_at?: string
          customer_handle: string
          customer_name?: string | null
          id?: string
          last_address?: string | null
          last_order_at?: string | null
          last_phone?: string | null
          lifetime_value?: number
          notes?: string | null
          preferences?: string | null
          restaurant_id: string
          total_orders?: number
          updated_at?: string
        }
        Update: {
          auto_preferences?: Json
          channel?: string
          created_at?: string
          customer_handle?: string
          customer_name?: string | null
          id?: string
          last_address?: string | null
          last_order_at?: string | null
          last_phone?: string | null
          lifetime_value?: number
          notes?: string | null
          preferences?: string | null
          restaurant_id?: string
          total_orders?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          area_name: string
          branch_id: string
          created_at: string
          eta_minutes: number | null
          fee: number
          id: string
          is_active: boolean
          min_order: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          area_name: string
          branch_id: string
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          area_name?: string
          branch_id?: string
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          channel: string
          created_at: string
          id: string
          message_template: string
          restaurant_id: string
          scheduled_at: string | null
          segment: string
          segment_params: Json
          sent_at: string | null
          stats: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          message_template: string
          restaurant_id: string
          scheduled_at?: string | null
          segment?: string
          segment_params?: Json
          sent_at?: string | null
          stats?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          message_template?: string
          restaurant_id?: string
          scheduled_at?: string | null
          segment?: string
          segment_params?: Json
          sent_at?: string | null
          stats?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          options: Json
          price: number
          restaurant_id: string
          search_aliases: string[]
          stock_qty: number | null
          track_stock: boolean
          updated_at: string
          upsell_category: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          options?: Json
          price: number
          restaurant_id: string
          search_aliases?: string[]
          stock_qty?: number | null
          track_stock?: boolean
          updated_at?: string
          upsell_category?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          options?: Json
          price?: number
          restaurant_id?: string
          search_aliases?: string[]
          stock_qty?: number | null
          track_stock?: boolean
          updated_at?: string
          upsell_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          name: string | null
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          name?: string | null
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          name?: string | null
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string | null
          conversation_id: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          dispatch_attempts: number
          dispatched_at: string | null
          external_order_id: string | null
          id: string
          items: Json
          meta: Json
          notes: string | null
          restaurant_id: string
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
        }
        Insert: {
          branch_id?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          dispatch_attempts?: number
          dispatched_at?: string | null
          external_order_id?: string | null
          id?: string
          items: Json
          meta?: Json
          notes?: string | null
          restaurant_id: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
        }
        Update: {
          branch_id?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          dispatch_attempts?: number
          dispatched_at?: string | null
          external_order_id?: string | null
          id?: string
          items?: Json
          meta?: Json
          notes?: string | null
          restaurant_id?: string
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          features: Json
          id: string
          is_active: boolean
          is_custom: boolean
          max_ai_replies: number
          max_branches: number
          max_confirmed_orders: number
          name_ar: string
          name_en: string | null
          price_iqd: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_custom?: boolean
          max_ai_replies?: number
          max_branches?: number
          max_confirmed_orders?: number
          name_ar: string
          name_en?: string | null
          price_iqd?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_custom?: boolean
          max_ai_replies?: number
          max_branches?: number
          max_confirmed_orders?: number
          name_ar?: string
          name_en?: string | null
          price_iqd?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      processed_updates: {
        Row: {
          channel: string
          processed_at: string
          update_key: string
        }
        Insert: {
          channel: string
          processed_at?: string
          update_key: string
        }
        Update: {
          channel?: string
          processed_at?: string
          update_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      restaurant_subscriptions: {
        Row: {
          activated_by: string | null
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          plan_id: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start?: string
          plan_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          currency: string
          delivery_areas: Json
          description: string | null
          facebook_page: string | null
          feature_flags: Json
          google_maps_url: string | null
          id: string
          instagram_handle: string | null
          is_active: boolean
          language: string
          latitude: number | null
          longitude: number | null
          menu_image_url: string | null
          menu_image_urls: string[]
          min_order: number
          name: string
          open_hours: Json
          owner_id: string
          owner_telegram_chat_id: string | null
          platform_webhook_secret: string | null
          platform_webhook_url: string | null
          telegram_bot_id: string | null
          telegram_bot_token: string | null
          telegram_bot_username: string | null
          tone: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          delivery_areas?: Json
          description?: string | null
          facebook_page?: string | null
          feature_flags?: Json
          google_maps_url?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          language?: string
          latitude?: number | null
          longitude?: number | null
          menu_image_url?: string | null
          menu_image_urls?: string[]
          min_order?: number
          name: string
          open_hours?: Json
          owner_id: string
          owner_telegram_chat_id?: string | null
          platform_webhook_secret?: string | null
          platform_webhook_url?: string | null
          telegram_bot_id?: string | null
          telegram_bot_token?: string | null
          telegram_bot_username?: string | null
          tone?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          delivery_areas?: Json
          description?: string | null
          facebook_page?: string | null
          feature_flags?: Json
          google_maps_url?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          language?: string
          latitude?: number | null
          longitude?: number | null
          menu_image_url?: string | null
          menu_image_urls?: string[]
          min_order?: number
          name?: string
          open_hours?: Json
          owner_id?: string
          owner_telegram_chat_id?: string | null
          platform_webhook_secret?: string | null
          platform_webhook_url?: string | null
          telegram_bot_id?: string | null
          telegram_bot_token?: string | null
          telegram_bot_username?: string | null
          tone?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      social_interactions: {
        Row: {
          created_at: string
          customer_handle: string | null
          customer_name: string | null
          error: string | null
          external_id: string
          id: string
          incoming_text: string | null
          kind: string
          meta: Json
          parent_id: string | null
          platform: string
          reply_text: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          error?: string | null
          external_id: string
          id?: string
          incoming_text?: string | null
          kind: string
          meta?: Json
          parent_id?: string | null
          platform: string
          reply_text?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_handle?: string | null
          customer_name?: string | null
          error?: string | null
          external_id?: string
          id?: string
          incoming_text?: string | null
          kind?: string
          meta?: Json
          parent_id?: string | null
          platform?: string
          reply_text?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      unmatched_queries: {
        Row: {
          conversation_id: string | null
          count: number
          first_seen_at: string
          id: string
          last_seen_at: string
          normalized_text: string
          query_text: string
          resolved_at: string | null
          resolved_to_item_id: string | null
          restaurant_id: string
        }
        Insert: {
          conversation_id?: string | null
          count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized_text: string
          query_text: string
          resolved_at?: string | null
          resolved_to_item_id?: string | null
          restaurant_id: string
        }
        Update: {
          conversation_id?: string | null
          count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          normalized_text?: string
          query_text?: string
          resolved_at?: string | null
          resolved_to_item_id?: string | null
          restaurant_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          ai_replies_used: number
          confirmed_orders_used: number
          id: string
          period_start: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          ai_replies_used?: number
          confirmed_orders_used?: number
          id?: string
          period_start: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          ai_replies_used?: number
          confirmed_orders_used?: number
          id?: string
          period_start?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          ref_id: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          ref_id?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ref_id?: string | null
          restaurant_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      weekly_bad_response_summary: {
        Row: {
          count: number | null
          last_at: string | null
          reason: string | null
          restaurant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_subscription: {
        Args: { _months?: number; _plan_code: string; _restaurant_id: string }
        Returns: string
      }
      approve_campaign: { Args: { _campaign_id: string }; Returns: undefined }
      consume_quota: {
        Args: { _kind: string; _ref?: string; _restaurant_id: string }
        Returns: Json
      }
      create_api_key: {
        Args: { p_label?: string; p_restaurant_id: string }
        Returns: string
      }
      decrement_stock: { Args: { _items: Json }; Returns: Json }
      get_bot_health: { Args: { _restaurant_id: string }; Returns: Json }
      get_my_subscription: { Args: { _restaurant_id: string }; Returns: Json }
      get_restaurant_readiness: {
        Args: { _restaurant_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _restaurant_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_ar: { Args: { t: string }; Returns: string }
      recall_customer: { Args: { _conversation_id: string }; Returns: Json }
      search_menu_fuzzy: {
        Args: {
          p_limit?: number
          p_query: string
          p_restaurant_id: string
          p_threshold?: number
        }
        Returns: {
          category: string
          description: string
          id: string
          name: string
          price: number
          similarity: number
        }[]
      }
      search_menu_items: {
        Args: { p_limit?: number; p_query: string; p_restaurant_id: string }
        Returns: {
          category: string
          description: string
          id: string
          name: string
          price: number
          similarity: number
        }[]
      }
      set_subscription_status: {
        Args: { _status: string; _sub_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      try_mark_update: {
        Args: { _channel: string; _key: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "staff" | "platform_admin"
      channel_type: "telegram" | "instagram" | "facebook" | "tiktok" | "web"
      conversation_state:
        | "greeting"
        | "collecting_items"
        | "address"
        | "confirm"
        | "submitted"
        | "handoff"
        | "closed"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "out_for_delivery"
        | "completed"
        | "cancelled"
        | "scheduled"
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
      app_role: ["admin", "owner", "staff", "platform_admin"],
      channel_type: ["telegram", "instagram", "facebook", "tiktok", "web"],
      conversation_state: [
        "greeting",
        "collecting_items",
        "address",
        "confirm",
        "submitted",
        "handoff",
        "closed",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "completed",
        "cancelled",
        "scheduled",
      ],
    },
  },
} as const
