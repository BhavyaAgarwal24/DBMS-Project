-- ============================================================
-- INDUSTRIAL POLLUTION MONITORING SYSTEM
-- SQL Queries: SELECT, Joins, Subqueries, Aggregates,
--              GROUP BY, HAVING, UPDATE, DELETE, Views
-- ============================================================


-- ============================================================
-- A. BASIC SELECT QUERIES
-- ============================================================

-- Q1: List all industries with their locations
SELECT i.industry_id, i.industry_name, i.industry_type,
       i.license_number, l.area_name, l.city
FROM   Industry i
JOIN   Location l ON i.location_id = l.location_id
ORDER BY i.industry_name;

-- Q2: Show all pollution readings from air monitoring stations
SELECT pr.reading_id, ms.station_type, pr.reading_datetime,
       pr.PM25, pr.PM10, pr.NO2, pr.SO2
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
WHERE  ms.station_type IN ('Air', 'Combined')
ORDER BY pr.reading_datetime DESC;

-- Q3: List all inspections that failed
SELECT ins.inspection_id, ind.industry_name, ins.inspection_date,
       ins.inspector_name, ins.remarks
FROM   Inspection ins
JOIN   Industry ind ON ins.industry_id = ind.industry_id
WHERE  ins.result = 'Fail'
ORDER BY ins.inspection_date;

-- Q4: Show all pending violations with industry details
SELECT v.violation_id, ind.industry_name, v.violation_type,
       v.penalty_amount, v.status
FROM   Violation v
JOIN   Industry ind ON v.industry_id = ind.industry_id
WHERE  v.status = 'Pending'
ORDER BY v.penalty_amount DESC;


-- ============================================================
-- B. JOIN QUERIES
-- ============================================================

-- Q5: Full details — Industry → Location → Station → Readings
SELECT l.city, l.area_name, ind.industry_name, ind.industry_type,
       ms.station_id, ms.station_type,
       pr.reading_datetime, pr.PM25, pr.PM10, pr.NO2, pr.SO2,
       pr.water_ph, pr.noise_level
FROM   Location l
JOIN   Industry ind            ON l.location_id = ind.location_id
JOIN   MonitoringStation ms    ON l.location_id = ms.location_id
JOIN   PollutionReading pr     ON ms.station_id = pr.station_id
ORDER BY l.city, pr.reading_datetime;

-- Q6: Industries with their violation history
SELECT ind.industry_name, ind.industry_type, l.city,
       v.violation_type, v.penalty_amount, v.status,
       pr.reading_datetime
FROM   Industry ind
JOIN   Violation v          ON ind.industry_id = v.industry_id
JOIN   PollutionReading pr  ON v.reading_id = pr.reading_id
JOIN   Location l           ON ind.location_id = l.location_id
ORDER BY ind.industry_name, pr.reading_datetime;

-- Q7: LEFT JOIN — All industries with their inspections (including those never inspected)
SELECT ind.industry_name, ind.industry_type,
       ins.inspection_date, ins.inspector_name, ins.result
FROM   Industry ind
LEFT JOIN Inspection ins ON ind.industry_id = ins.industry_id
ORDER BY ind.industry_name, ins.inspection_date;


-- ============================================================
-- C. SUBQUERIES
-- ============================================================

-- Q8: Industries that have NEVER been inspected
SELECT industry_name, industry_type, license_number
FROM   Industry
WHERE  industry_id NOT IN (
    SELECT DISTINCT industry_id FROM Inspection
);

-- Q9: Readings where PM2.5 exceeds the average PM2.5 across all readings
SELECT pr.reading_id, ms.station_type, l.area_name,
       pr.PM25, pr.reading_datetime
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id
WHERE  pr.PM25 > (
    SELECT AVG(PM25) FROM PollutionReading WHERE PM25 IS NOT NULL
);

-- Q10: Industry with the highest total penalty amount
SELECT ind.industry_name, ind.industry_type, total_penalty
FROM   Industry ind
JOIN   (
    SELECT industry_id, SUM(penalty_amount) AS total_penalty
    FROM   Violation
    GROUP BY industry_id
    ORDER BY total_penalty DESC
    LIMIT 1
) v ON ind.industry_id = v.industry_id;

-- Q11: Stations that have recorded readings with PM10 > 200 (correlated subquery)
SELECT ms.station_id, ms.station_type, l.area_name, l.city
FROM   MonitoringStation ms
JOIN   Location l ON ms.location_id = l.location_id
WHERE  EXISTS (
    SELECT 1 FROM PollutionReading pr
    WHERE  pr.station_id = ms.station_id
    AND    pr.PM10 > 200
);


-- ============================================================
-- D. AGGREGATE QUERIES WITH GROUP BY AND HAVING
-- ============================================================

-- Q12: Average air pollution per location
SELECT l.area_name, l.city,
       ROUND(AVG(pr.PM25), 2)  AS avg_PM25,
       ROUND(AVG(pr.PM10), 2)  AS avg_PM10,
       ROUND(AVG(pr.NO2), 2)   AS avg_NO2,
       ROUND(AVG(pr.SO2), 2)   AS avg_SO2
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id
WHERE  pr.PM25 IS NOT NULL
GROUP BY l.location_id, l.area_name, l.city
ORDER BY avg_PM25 DESC;

-- Q13: Total violations and penalties per industry
SELECT ind.industry_name,
       COUNT(v.violation_id)        AS total_violations,
       SUM(v.penalty_amount)        AS total_penalty,
       ROUND(AVG(v.penalty_amount), 2) AS avg_penalty
FROM   Industry ind
JOIN   Violation v ON ind.industry_id = v.industry_id
GROUP BY ind.industry_id, ind.industry_name
ORDER BY total_penalty DESC;

-- Q14: Industries with more than 1 violation (HAVING)
SELECT ind.industry_name,
       COUNT(v.violation_id) AS violation_count,
       SUM(v.penalty_amount) AS total_penalty
FROM   Industry ind
JOIN   Violation v ON ind.industry_id = v.industry_id
GROUP BY ind.industry_id, ind.industry_name
HAVING COUNT(v.violation_id) > 1
ORDER BY violation_count DESC;

-- Q15: Monthly pollution trend — average PM2.5
SELECT DATE_FORMAT(pr.reading_datetime, '%Y-%m') AS month,
       COUNT(*)                                  AS reading_count,
       ROUND(AVG(pr.PM25), 2)                    AS avg_PM25,
       ROUND(MAX(pr.PM25), 2)                    AS max_PM25
FROM   PollutionReading pr
WHERE  pr.PM25 IS NOT NULL
GROUP BY DATE_FORMAT(pr.reading_datetime, '%Y-%m')
ORDER BY month;

-- Q16: Count of inspections per result category
SELECT result,
       COUNT(*) AS inspection_count
FROM   Inspection
GROUP BY result
ORDER BY inspection_count DESC;

-- Q17: Cities with average noise level > 80 dB
SELECT l.city,
       ROUND(AVG(pr.noise_level), 2) AS avg_noise
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id
WHERE  pr.noise_level IS NOT NULL
GROUP BY l.city
HAVING AVG(pr.noise_level) > 80
ORDER BY avg_noise DESC;


-- ============================================================
-- E. UPDATE QUERIES
-- ============================================================

-- Q18: Resolve a specific violation
UPDATE Violation
SET    status = 'Resolved'
WHERE  violation_id = 3;

-- Q19: Update industry type
UPDATE Industry
SET    industry_type = 'Petrochemical'
WHERE  industry_id = 3;

-- Q20: Update inspector remark after follow-up
UPDATE Inspection
SET    remarks = 'Follow-up: All corrective actions implemented successfully.',
       result  = 'Pass'
WHERE  inspection_id = 12;


-- ============================================================
-- F. DELETE QUERIES
-- ============================================================

-- Q21: Delete a resolved violation (example)
-- DELETE FROM Violation WHERE violation_id = 5;

-- Q22: Delete old readings before a date (example)
-- DELETE FROM PollutionReading WHERE reading_datetime < '2025-01-01';

-- NOTE: Above DELETEs are commented out to preserve data.
--       Uncomment to execute.


-- ============================================================
-- G. VIEWS
-- ============================================================

-- V1: Pollution Summary View — latest readings per station
DROP VIEW IF EXISTS v_pollution_summary;
CREATE VIEW v_pollution_summary AS
SELECT ms.station_id, ms.station_type,
       l.area_name, l.city,
       pr.reading_datetime,
       pr.PM25, pr.PM10, pr.NO2, pr.SO2,
       pr.water_ph, pr.noise_level
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id;

SELECT * FROM v_pollution_summary;

-- V2: Industry Compliance View — inspections + violations
DROP VIEW IF EXISTS v_industry_compliance;
CREATE VIEW v_industry_compliance AS
SELECT ind.industry_id, ind.industry_name, ind.industry_type,
       l.city,
       (SELECT COUNT(*) FROM Inspection ins
        WHERE ins.industry_id = ind.industry_id) AS total_inspections,
       (SELECT COUNT(*) FROM Inspection ins
        WHERE ins.industry_id = ind.industry_id AND ins.result = 'Fail') AS failed_inspections,
       (SELECT COUNT(*) FROM Violation v
        WHERE v.industry_id = ind.industry_id) AS total_violations,
       (SELECT COALESCE(SUM(v.penalty_amount), 0) FROM Violation v
        WHERE v.industry_id = ind.industry_id) AS total_penalty
FROM   Industry ind
JOIN   Location l ON ind.location_id = l.location_id;

SELECT * FROM v_industry_compliance;

-- V3: City-wise Pollution Report View
DROP VIEW IF EXISTS v_city_pollution_report;
CREATE VIEW v_city_pollution_report AS
SELECT l.city,
       COUNT(DISTINCT ms.station_id) AS monitoring_stations,
       COUNT(pr.reading_id)          AS total_readings,
       ROUND(AVG(pr.PM25), 2)       AS avg_PM25,
       ROUND(AVG(pr.PM10), 2)       AS avg_PM10,
       ROUND(AVG(pr.NO2), 2)        AS avg_NO2,
       ROUND(AVG(pr.SO2), 2)        AS avg_SO2,
       ROUND(AVG(pr.water_ph), 2)   AS avg_water_ph,
       ROUND(AVG(pr.noise_level), 2) AS avg_noise
FROM   Location l
LEFT JOIN MonitoringStation ms  ON l.location_id = ms.location_id
LEFT JOIN PollutionReading pr   ON ms.station_id = pr.station_id
GROUP BY l.city
ORDER BY l.city;

SELECT * FROM v_city_pollution_report;
