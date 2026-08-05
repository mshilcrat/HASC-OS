// wb-config.js
// Shared connection for the HASC RM Compliance Workbook.
// This is the PUBLIC (anon) key — safe to be here. Real protection is
// handled by Supabase Row Level Security + each user's login.
window.HASC_CONFIG = {
  SUPABASE_URL: "https://xqcykvgsesavtuautivq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3lrdmdzZXNhdnR1YXV0aXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzc1ODUsImV4cCI6MjA5MTkxMzU4NX0.A6FkxttGZMGaPxqr1orOWlpoO_zZSeqbp5W3L7s6U5w"
};
