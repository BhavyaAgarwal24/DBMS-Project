# DBMS-Project TODO

- [ ] Add backend simulation endpoint
  - [ ] POST /api/simulation/start
  - [ ] Insert random PollutionReading rows for random MonitoringStation
  - [ ] Insert matching Inspection rows
  - [ ] Set Inspection.result to Pass / Warning / Fail
- [ ] Add “Start Simulation” button on Admin SQL Console page
- [ ] Add frontend call to /api/simulation/start
- [ ] Visually highlight Warning inspections on the Inspections table
  - [ ] Update loadUserInspections() row rendering
  - [ ] Add CSS animation
- [ ] Manual test checklist
  - [ ] Login as admin
  - [ ] Open SQL Console
  - [ ] Click Start Simulation
  - [ ] Open Inspections view
  - [ ] Confirm Warning rows are highlighted

