export async function callClickUpAPI(apiToken: string, endpoint: string, options?: RequestInit) {
  const baseUrl = 'https://api.clickup.com/api/v2';
  const fullUrl = `${baseUrl}${endpoint}`;
  
  console.log('ClickUp API Request:', {
    url: fullUrl,
    method: options?.method || 'GET',
    body: options?.body ? JSON.parse(options.body as string) : undefined,
  });

  const response = await fetch(fullUrl, {
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const responseText = await response.text();
  
  console.log('ClickUp API Response:', {
    url: fullUrl,
    status: response.status,
    statusText: response.statusText,
    body: responseText ? (() => {
      try { return JSON.parse(responseText); } catch { return responseText; }
    })() : undefined,
  });

  if (!response.ok) {
    throw new Error(`ClickUp API Error (${response.status}): ${responseText}`);
  }

  return responseText ? JSON.parse(responseText) : null;
}

export async function getClickUpUser(apiToken: string) {
  return callClickUpAPI(apiToken, '/user');
}

export async function getClickUpTasksFromList(apiToken: string, listId: string) {
  return callClickUpAPI(apiToken, `/list/${listId}/task?include_closed=true&subtasks=false`);
}

export async function updateClickUpTaskStatus(apiToken: string, taskId: string, status: string, settings: any) {
  const clickupStatus = mapSystemStatusToClickUp(status, settings);
  if (!clickupStatus) return null;
  
  return callClickUpAPI(apiToken, `/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: clickupStatus }),
  });
}

export async function updateClickUpTaskTitle(apiToken: string, taskId: string, title: string) {
  return callClickUpAPI(apiToken, `/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: title }),
  });
}

export async function updateClickUpTaskDescription(apiToken: string, taskId: string, description: string) {
  return callClickUpAPI(apiToken, `/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ description }),
  });
}

// Get a ClickUp task by ID to retrieve custom field information
export async function getClickUpTask(apiToken: string, taskId: string) {
  return callClickUpAPI(apiToken, `/task/${taskId}`);
}

// Update a custom field on a ClickUp task
export async function updateClickUpCustomField(apiToken: string, taskId: string, fieldId: string, value: any, fieldType?: string) {
  // For URL fields, ClickUp might require a specific format
  // Let's log the field type if we have it
  console.log('updateClickUpCustomField called with:', {
    fieldId,
    value,
    fieldType,
  });

  return callClickUpAPI(apiToken, `/task/${taskId}/field/${fieldId}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
}

// Update the "Design Output Link" custom field on a ClickUp task
export async function updateClickUpDesignOutputLink(apiToken: string, taskId: string, link: string) {
  try {
    console.log('updateClickUpDesignOutputLink called with:', {
      taskId,
      linkToSet: link,
    });

    // First, get the task to find the custom field ID for "Design Output Link"
    const task = await getClickUpTask(apiToken, taskId);
    console.log('Fetched ClickUp task for custom field update:', task);
    
    if (task.custom_fields) {
      console.log('ClickUp task custom fields:', task.custom_fields);
      
      const designOutputField = task.custom_fields.find(
        (field: any) => field.name === 'Design Output Link'
      );

      console.log('Found design output field:', designOutputField);

      if (designOutputField) {
        console.log('Updating Design Output Link custom field:', {
          id: designOutputField.id,
          type: designOutputField.type,
          value: link,
        });
        // Update the custom field
        const result = await updateClickUpCustomField(apiToken, taskId, designOutputField.id, link, designOutputField.type);
        console.log('Successfully updated Design Output Link:', result);
        return result;
      } else {
        console.error('Could not find "Design Output Link" custom field on ClickUp task - available fields:', task.custom_fields.map((f: any) => f.name));
      }
    } else {
      console.error('ClickUp task has no custom_fields:', task);
    }
  } catch (error) {
    console.error('Error updating ClickUp Design Output Link:', error);
    throw error;
  }
}

// Update the "Caption" custom field on a ClickUp task
export async function updateClickUpCaption(apiToken: string, taskId: string, caption: string) {
  try {
    // First, get the task to find the custom field ID for "Caption"
    const task = await getClickUpTask(apiToken, taskId);
    
    if (task.custom_fields) {
      const captionField = task.custom_fields.find(
        (field: any) => field.name === 'Caption'
      );

      if (captionField) {
        // Update the custom field
        return await updateClickUpCustomField(apiToken, taskId, captionField.id, caption);
      } else {
        console.error('Could not find "Caption" custom field on ClickUp task');
      }
    }
  } catch (error) {
    console.error('Error updating ClickUp Caption:', error);
    throw error;
  }
}

// Update the "Client" custom field on a ClickUp task
export async function updateClickUpClient(apiToken: string, taskId: string, clientName: string) {
  try {
    console.log('updateClickUpClient called with:', {
      taskId,
      clientName,
    });

    // First, get the task to find the custom field ID for "Client"
    const task = await getClickUpTask(apiToken, taskId);
    
    if (task.custom_fields) {
      console.log('ClickUp task custom fields for Client update:', task.custom_fields.map((f: any) => ({ name: f.name, type: f.type })));
      
      const clientField = task.custom_fields.find(
        (field: any) => field.name === 'Client'
      );

      console.log('Found Client custom field:', JSON.stringify(clientField, null, 2));

      if (clientField) {
        let valueToSend = clientName;
        
        // If it's a drop down, find the option ID by name
        if (clientField.type === 'drop_down' && clientField.type_config?.options) {
          console.log('Client field is a drop down, looking for option matching:', clientName);
          const matchingOption = clientField.type_config.options.find(
            (opt: any) => opt.name?.toLowerCase() === clientName.toLowerCase()
          );
          
          if (matchingOption) {
            console.log('Found matching option:', matchingOption);
            valueToSend = matchingOption.id; // Drop downs use option ID, not name
          } else {
            console.warn('No matching drop down option found for client:', clientName, 'Available options:', clientField.type_config.options.map((o: any) => o.name));
          }
        }

        console.log('Updating Client custom field with:', {
          fieldId: clientField.id,
          value: valueToSend,
          fieldType: clientField.type
        });

        // Update the custom field
        const result = await updateClickUpCustomField(apiToken, taskId, clientField.id, valueToSend, clientField.type);
        console.log('Successfully updated Client custom field:', result);
        return result;
      } else {
        console.error('Could not find "Client" custom field on ClickUp task - available fields:', task.custom_fields.map((f: any) => f.name));
      }
    }
  } catch (error) {
    console.error('Error updating ClickUp Client custom field:', error);
    throw error;
  }
}

export function mapClickUpStatusToSystem(clickupStatus: string, settings: any): string {
  // Normalize status for comparison (lowercase, replace underscores with spaces)
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, ' ');
  
  const normalizedClickupStatus = normalize(clickupStatus);
  
  const statusMap: Record<string, string> = {};
  if (settings.clickup_status_for_review) {
    statusMap[normalize(settings.clickup_status_for_review)] = 'for_review';
  }
  if (settings.clickup_status_approved) {
    statusMap[normalize(settings.clickup_status_approved)] = 'approved';
  }
  if (settings.clickup_status_for_revision) {
    statusMap[normalize(settings.clickup_status_for_revision)] = 'for_revision';
  }
  if (settings.clickup_status_published) {
    statusMap[normalize(settings.clickup_status_published)] = 'published';
  }
  
  console.log('mapClickUpStatusToSystem', {
    clickupStatus,
    normalizedClickupStatus,
    settingsStatuses: {
      for_review: settings.clickup_status_for_review,
      approved: settings.clickup_status_approved,
      for_revision: settings.clickup_status_for_revision,
      published: settings.clickup_status_published,
    },
    statusMap,
    result: statusMap[normalizedClickupStatus] || 'for_review'
  });
  
  return statusMap[normalizedClickupStatus] || 'for_review';
}

export function mapSystemStatusToClickUp(systemStatus: string, settings: any): string {
  const statusMap: Record<string, string> = {
    'for_review': settings.clickup_status_for_review,
    'approved': settings.clickup_status_approved,
    'for_revision': settings.clickup_status_for_revision,
    'published': settings.clickup_status_published,
  };
  return statusMap[systemStatus] || '';
}

export function extractGoogleDriveLink(task: any): string {
  // Look for Design Output Link custom field first
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Design Output Link' && field.value) {
        // Extract just the google drive link from any surrounding content
        const driveRegex = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s`]+/g;
        const matches = field.value.match(driveRegex);
        if (matches && matches.length > 0) {
          let link = matches[0].trim();
          // Also clean up preview link if needed
          link = link.replace('/preview', '/view');
          return link;
        }
      }
    }
  }
  
  // If not found, look for any google drive link in description
  if (task.description) {
    const driveRegex = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s<]+/g;
    const matches = task.description.match(driveRegex);
    if (matches && matches.length > 0) {
      let link = matches[0].trim();
      link = link.replace('/preview', '/view');
      return link;
    }
  }
  
  return '';
}

export function extractClientName(task: any): string | null {
  // Look for Client custom field
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Client') {
        // It's a dropdown, so we need to get the label from type_config
        if (field.type_config?.options) {
          const selectedOption = field.type_config.options.find((opt: any) => opt.id === field.value);
          if (selectedOption) {
            return selectedOption.name;
          }
        }
        // Fallback if we can't get the label
        if (field.value) {
          return String(field.value);
        }
      }
    }
  }
  return null;
}

export function extractCaption(task: any): string {
  // Look for Caption custom field first
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Caption' && field.value) {
        return field.value;
      }
    }
  }
  
  // Fallback to task description
  const description = task.description || '';
  // Ensure we never return empty string to avoid validation issues
  return description.trim() || ' ';
}

// Create a new task in ClickUp
export async function createClickUpTask(apiToken: string, listId: string, title: string, description: string, status: string, settings: any) {
  const clickupStatus = mapSystemStatusToClickUp(status, settings);
  
  const body: any = {
    name: title,
    description: description,
  };
  
  if (clickupStatus) {
    body.status = clickupStatus;
  }
  
  return callClickUpAPI(apiToken, `/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
