// src/components/Entry/constants.js
export const baseColumnsDef = [
  { header: '', accessorKey: 'actions', id: 'actions', enableColumnResizing: false, size: 60, minSize: 50, className: 'col-actions' },
  { header: 'Sr.', accessorKey: 'sr', id: 'sr', enableColumnResizing: false, size: 30, minSize: 30, className: 'col-sr' },
  { header: 'Title', accessorKey: 'title', id: 'title', size: 120, minSize: 120, className: 'col-title' },
  { header: 'Name', accessorKey: 'name', id: 'name', size: 250, minSize: 200, className: 'col-name' },      // ← yeh bada rakha
  { header: 'Team', accessorKey: 'team', id: 'team', size: 180, minSize: 200, className: 'col-team' },
  { header: 'Gender', accessorKey: 'gender', id: 'gender', size: 100, minSize: 140, className: 'col-gender' },
  { header: 'DOB', accessorKey: 'dob', id: 'dob', size: 120, minSize: 100, className: 'col-dob' },
  { header: 'Weight (KG)', accessorKey: 'weight', id: 'weight', size: 100, minSize: 120, className: 'col-weight' },
  { header: 'Event', accessorKey: 'event', id: 'event', size: 120, minSize: 120, className: 'col-event' },
  { header: 'Sub Event', accessorKey: 'subEvent', id: 'subEvent', size: 140, minSize: 160, className: 'col-subEvent' },
  { header: 'Age Category', accessorKey: 'ageCategory', id: 'ageCategory', size: 140, minSize: 180, className: 'col-ageCategory' },
  { header: 'Weight Category', accessorKey: 'weightCategory', id: 'weightCategory', size: 10, minSize: 210, className: 'col-weightCategory' },
  { header: 'Medal', accessorKey: 'medal', id: 'medal', size: 120, minSize: 130, className: 'col-medal' },
  { header: 'Coach', accessorKey: 'coach', id: 'coach', size: 180, minSize: 200, className: 'col-coach' },
  { header: 'Coach Contact', accessorKey: 'coachContact', id: 'coachContact', size: 160, minSize: 150, className: 'col-coachContact' },
  { header: 'Manager', accessorKey: 'manager', id: 'manager', size: 180, minSize: 200, className: 'col-manager' },
  { header: 'Manager Contact', accessorKey:'managerContact', id:'managerContact', size :150 ,minSize :160 ,className :'col-managerContact'},
];

// Optional columns (same tareeke se size add kar do)
export const optionalColumnsDef = [
  { header: "Father's Name", accessorKey: 'fathersName', id: 'fathersName', size: 300, minSize: 350, className: 'col-fathersName' },
  { header: 'School', accessorKey: 'school', id: 'school', size: 220, minSize: 200, className: 'col-school' },
  { header: 'Class', accessorKey: 'class', id: 'class', size: 100, minSize: 80, className: 'col-class' },
];