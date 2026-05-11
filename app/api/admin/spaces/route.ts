import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: spaces, error: sError } = await supabase.from('spaces').select('*').order('created_at', { ascending: true });
  const { data: folders, error: fError } = await supabase.from('folders').select('*').order('created_at', { ascending: true });
  const { data: lists, error: lError } = await supabase.from('lists').select('*').order('created_at', { ascending: true });

  if (sError || fError || lError) {
    return NextResponse.json({ error: 'Failed to fetch hierarchy' }, { status: 500 });
  }

  return NextResponse.json({ spaces, folders, lists });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { type, ...data } = await req.json();

    if (type === 'space') {
      const { data: space, error } = await supabase.from('spaces').insert([data]).select().single();
      if (error) throw error;
      return NextResponse.json(space);
    } 
    
    if (type === 'folder') {
      const { data: folder, error } = await supabase.from('folders').insert([data]).select().single();
      if (error) throw error;
      return NextResponse.json(folder);
    }

    if (type === 'list') {
      const { data: list, error } = await supabase.from('lists').insert([data]).select().single();
      if (error) throw error;
      return NextResponse.json(list);
    }

    if (type === 'duplicate') {
      const { id, itemType } = data;
      
      const cleanObj = (obj: any) => {
        const newObj = { ...obj };
        delete newObj.id;
        delete newObj.created_at;
        return newObj;
      };

      if (itemType === 'list') {
        const { data: source, error: sErr } = await supabase.from('lists').select('*').eq('id', id).single();
        if (sErr) throw sErr;
        const { data: newList, error: lErr } = await supabase.from('lists').insert([
          { ...cleanObj(source), name: `${source.name} (Copy)` }
        ]).select().single();
        if (lErr) throw lErr;
        const { data: sourceTasks } = await supabase.from('project_tasks').select('*').eq('list_id', id);
        if (sourceTasks?.length) {
          await supabase.from('project_tasks').insert(sourceTasks.map(t => ({ ...cleanObj(t), list_id: newList.id })));
        }
        return NextResponse.json({ success: true });
      }

      if (itemType === 'folder') {
        const { data: source, error: sErr } = await supabase.from('folders').select('*').eq('id', id).single();
        if (sErr) throw sErr;
        const { data: newFolder, error: fErr } = await supabase.from('folders').insert([
          { ...cleanObj(source), name: `${source.name} (Copy)` }
        ]).select().single();
        if (fErr) throw fErr;
        const { data: sourceLists } = await supabase.from('lists').select('*').eq('parent_id', id);
        for (const list of (sourceLists || [])) {
          const { data: newList } = await supabase.from('lists').insert([
            { ...cleanObj(list), parent_id: newFolder.id }
          ]).select().single();
          const { data: sourceTasks } = await supabase.from('project_tasks').select('*').eq('list_id', list.id);
          if (sourceTasks?.length) {
            await supabase.from('project_tasks').insert(sourceTasks.map(t => ({ ...cleanObj(t), list_id: newList.id })));
          }
        }
        return NextResponse.json({ success: true });
      }

      if (itemType === 'space') {
        const { data: source, error: sErr } = await supabase.from('spaces').select('*').eq('id', id).single();
        if (sErr) throw sErr;
        const { data: newSpace, error: spErr } = await supabase.from('spaces').insert([
          { ...cleanObj(source), name: `${source.name} (Copy)` }
        ]).select().single();
        if (spErr) throw spErr;
        
        // Clone folders
        const { data: sourceFolders } = await supabase.from('folders').select('*').eq('space_id', id);
        for (const folder of (sourceFolders || [])) {
          const { data: newFolder } = await supabase.from('folders').insert([
            { ...cleanObj(folder), space_id: newSpace.id }
          ]).select().single();
          const { data: sourceLists } = await supabase.from('lists').select('*').eq('parent_id', folder.id);
          for (const list of (sourceLists || [])) {
            const { data: newList } = await supabase.from('lists').insert([
              { ...cleanObj(list), parent_id: newFolder.id }
            ]).select().single();
            const { data: sourceTasks } = await supabase.from('project_tasks').select('*').eq('list_id', list.id);
            if (sourceTasks?.length) {
              await supabase.from('project_tasks').insert(sourceTasks.map(t => ({ ...cleanObj(t), list_id: newList.id })));
            }
          }
        }
        
        // Clone independent lists
        const { data: independentLists } = await supabase.from('lists').select('*').eq('parent_id', id);
        for (const list of (independentLists || [])) {
          const { data: newList } = await supabase.from('lists').insert([
            { ...cleanObj(list), parent_id: newSpace.id }
          ]).select().single();
          const { data: sourceTasks } = await supabase.from('project_tasks').select('*').eq('list_id', list.id);
          if (sourceTasks?.length) {
            await supabase.from('project_tasks').insert(sourceTasks.map(t => ({ ...cleanObj(t), list_id: newList.id })));
          }
        }
        return NextResponse.json({ success: true });
      }
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { type, id, ...updates } = await req.json();
    const table = type === 'space' ? 'spaces' : type === 'folder' ? 'folders' : 'lists';
    
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type');

  if (!id || !type) return NextResponse.json({ error: 'Missing ID or type' }, { status: 400 });

  try {
    const table = type === 'space' ? 'spaces' : type === 'folder' ? 'folders' : 'lists';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
