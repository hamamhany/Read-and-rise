// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://llsgzgbcmbwxgbhdxejm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc2d6Z2JjbWJ3eGdiaGR4ZWptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTY0MjQsImV4cCI6MjEwMTc3MjQyNH0.CyW4_xd4daesdm21trqEz_JmYQvnQIcnc6sje_ph2No';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);