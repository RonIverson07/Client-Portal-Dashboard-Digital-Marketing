import { supabaseAdmin } from './supabaseAdmin';
import bcrypt from 'bcryptjs';

export async function seedAdminIfNotExists() {
  const { data: existingAdmin, error } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('email', 'admin@portal.com')
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
    console.error('Error checking for existing admin:', error);
    return;
  }

  if (!existingAdmin) {
    const hash = bcrypt.hashSync('Admin1234!', 12);
    const { error: insertError } = await supabaseAdmin
      .from('admin_users')
      .insert([
        { name: 'Admin User', email: 'admin@portal.com', password_hash: hash, role: 'admin' }
      ]);

    if (insertError) {
      console.error('Error creating default admin:', insertError);
    } else {
      console.log('✅ Default admin created: admin@portal.com / Admin1234!');
    }
  }
}
