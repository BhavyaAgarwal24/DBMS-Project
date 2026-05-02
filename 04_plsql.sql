-- ============================================================
-- INDUSTRIAL POLLUTION MONITORING SYSTEM
-- PL/SQL Script: Procedures, Functions, Triggers, Cursors,
--                Exception Handling, Transactions
-- Database: MySQL (uses DELIMITER syntax)
-- ============================================================

USE pollution_monitoring;


-- ============================================================
-- 1. STORED PROCEDURE: Generate Pollution Report for a Location
--    Returns average pollution parameters for a given location
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_generate_pollution_report //

CREATE PROCEDURE sp_generate_pollution_report(
    IN p_location_id INT
)
BEGIN
    DECLARE v_area_name VARCHAR(100);
    DECLARE v_city      VARCHAR(100);
    DECLARE v_count     INT;

    -- Exception Handling: Check if location exists
    SELECT COUNT(*) INTO v_count
    FROM   Location
    WHERE  location_id = p_location_id;

    IF v_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Error: Location ID not found.';
    END IF;

    SELECT area_name, city INTO v_area_name, v_city
    FROM   Location
    WHERE  location_id = p_location_id;

    SELECT CONCAT('Pollution Report for: ', v_area_name, ', ', v_city) AS report_title;

    -- Air Pollution Summary
    SELECT 'AIR POLLUTION SUMMARY' AS section,
           COUNT(pr.reading_id)     AS total_readings,
           ROUND(AVG(pr.PM25), 2)   AS avg_PM25,
           ROUND(MAX(pr.PM25), 2)   AS max_PM25,
           ROUND(AVG(pr.PM10), 2)   AS avg_PM10,
           ROUND(MAX(pr.PM10), 2)   AS max_PM10,
           ROUND(AVG(pr.NO2), 2)    AS avg_NO2,
           ROUND(AVG(pr.SO2), 2)    AS avg_SO2
    FROM   PollutionReading pr
    JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
    WHERE  ms.location_id = p_location_id
    AND    pr.PM25 IS NOT NULL;

    -- Water Quality Summary
    SELECT 'WATER QUALITY SUMMARY' AS section,
           COUNT(pr.reading_id)     AS total_readings,
           ROUND(AVG(pr.water_ph), 2) AS avg_ph,
           ROUND(MIN(pr.water_ph), 2) AS min_ph,
           ROUND(MAX(pr.water_ph), 2) AS max_ph
    FROM   PollutionReading pr
    JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
    WHERE  ms.location_id = p_location_id
    AND    pr.water_ph IS NOT NULL;

    -- Noise Pollution Summary
    SELECT 'NOISE POLLUTION SUMMARY' AS section,
           COUNT(pr.reading_id)       AS total_readings,
           ROUND(AVG(pr.noise_level), 2) AS avg_noise_db,
           ROUND(MAX(pr.noise_level), 2) AS max_noise_db
    FROM   PollutionReading pr
    JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
    WHERE  ms.location_id = p_location_id
    AND    pr.noise_level IS NOT NULL;

END //

DELIMITER ;

-- Usage:
-- CALL sp_generate_pollution_report(1);
-- CALL sp_generate_pollution_report(3);
-- CALL sp_generate_pollution_report(999);  -- Will raise an error


-- ============================================================
-- 2. STORED PROCEDURE: Record a New Inspection
--    With transaction management (COMMIT / ROLLBACK)
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_record_inspection //

CREATE PROCEDURE sp_record_inspection(
    IN p_industry_id    INT,
    IN p_date           DATE,
    IN p_inspector      VARCHAR(100),
    IN p_remarks        TEXT,
    IN p_result         VARCHAR(20)
)
BEGIN
    DECLARE v_industry_count INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Transaction failed. Inspection not recorded.';
    END;

    -- Validate industry exists
    SELECT COUNT(*) INTO v_industry_count
    FROM   Industry
    WHERE  industry_id = p_industry_id;

    IF v_industry_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Error: Industry ID does not exist.';
    END IF;

    -- Validate result value
    IF p_result NOT IN ('Pass', 'Fail', 'Warning') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Error: Result must be Pass, Fail, or Warning.';
    END IF;

    START TRANSACTION;

    INSERT INTO Inspection (industry_id, inspection_date, inspector_name, remarks, result)
    VALUES (p_industry_id, p_date, p_inspector, p_remarks, p_result);

    COMMIT;

    SELECT 'Inspection recorded successfully.' AS message,
           LAST_INSERT_ID() AS new_inspection_id;
END //

DELIMITER ;

-- Usage:
-- CALL sp_record_inspection(2, '2025-11-01', 'Rajesh Kumar', 'Annual review complete.', 'Pass');


-- ============================================================
-- 3. FUNCTION: Calculate Pollution Severity
--    Returns severity level based on PM2.5 value
-- ============================================================

DELIMITER //

DROP FUNCTION IF EXISTS fn_pollution_severity //

CREATE FUNCTION fn_pollution_severity(
    p_pm25 DECIMAL(7,2)
)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE severity VARCHAR(20);

    IF p_pm25 IS NULL THEN
        SET severity = 'No Data';
    ELSEIF p_pm25 <= 30 THEN
        SET severity = 'Good';
    ELSEIF p_pm25 <= 60 THEN
        SET severity = 'Moderate';
    ELSEIF p_pm25 <= 90 THEN
        SET severity = 'Unhealthy';
    ELSEIF p_pm25 <= 120 THEN
        SET severity = 'Very Unhealthy';
    ELSEIF p_pm25 <= 250 THEN
        SET severity = 'Hazardous';
    ELSE
        SET severity = 'Emergency';
    END IF;

    RETURN severity;
END //

DELIMITER ;

-- Usage:
-- SELECT fn_pollution_severity(45.0);   -- 'Moderate'
-- SELECT fn_pollution_severity(130.0);  -- 'Hazardous'

-- Apply function to actual data:
SELECT pr.reading_id,
       l.area_name,
       pr.PM25,
       fn_pollution_severity(pr.PM25) AS severity_level
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id
WHERE  pr.PM25 IS NOT NULL
ORDER BY pr.PM25 DESC;


-- ============================================================
-- 4. FUNCTION: Calculate Water Quality Index
--    Returns water quality based on pH value
-- ============================================================

DELIMITER //

DROP FUNCTION IF EXISTS fn_water_quality //

CREATE FUNCTION fn_water_quality(
    p_ph DECIMAL(4,2)
)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    IF p_ph IS NULL THEN
        RETURN 'No Data';
    ELSEIF p_ph < 4.5 THEN
        RETURN 'Severely Acidic';
    ELSEIF p_ph < 6.5 THEN
        RETURN 'Acidic';
    ELSEIF p_ph <= 8.5 THEN
        RETURN 'Normal';
    ELSEIF p_ph <= 10.0 THEN
        RETURN 'Alkaline';
    ELSE
        RETURN 'Severely Alkaline';
    END IF;
END //

DELIMITER ;

-- Usage:
SELECT pr.reading_id, l.area_name,
       pr.water_ph,
       fn_water_quality(pr.water_ph) AS water_quality
FROM   PollutionReading pr
JOIN   MonitoringStation ms ON pr.station_id = ms.station_id
JOIN   Location l           ON ms.location_id = l.location_id
WHERE  pr.water_ph IS NOT NULL
ORDER BY pr.water_ph;


-- ============================================================
-- 5. TRIGGER: Auto-detect Compliance Violation on New Reading
--    When a pollution reading is inserted, if PM2.5 > 100
--    or water_ph < 5 or noise_level > 85, a violation is
--    created automatically for all industries in that location.
-- ============================================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_detect_violation //

CREATE TRIGGER trg_detect_violation
AFTER INSERT ON PollutionReading
FOR EACH ROW
BEGIN
    DECLARE v_location_id INT;
    DECLARE v_viol_type   VARCHAR(50);
    DECLARE v_industry_id INT;
    DECLARE v_done        INT DEFAULT 0;

    -- Cursor to loop through industries in the same location
    DECLARE cur_industries CURSOR FOR
        SELECT ind.industry_id
        FROM   Industry ind
        JOIN   MonitoringStation ms ON ind.location_id = ms.location_id
        WHERE  ms.station_id = NEW.station_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    -- Get location of the station
    SELECT location_id INTO v_location_id
    FROM   MonitoringStation
    WHERE  station_id = NEW.station_id;

    -- Check for AIR violation (PM2.5 > 100)
    IF NEW.PM25 IS NOT NULL AND NEW.PM25 > 100 THEN
        SET v_viol_type = 'Air';

        OPEN cur_industries;
        air_loop: LOOP
            FETCH cur_industries INTO v_industry_id;
            IF v_done = 1 THEN
                LEAVE air_loop;
            END IF;

            INSERT INTO Violation (industry_id, reading_id, violation_type, penalty_amount, status)
            VALUES (v_industry_id, NEW.reading_id, v_viol_type, 50000.00, 'Pending');
        END LOOP air_loop;
        CLOSE cur_industries;
        SET v_done = 0;
    END IF;

    -- Check for WATER violation (pH < 5)
    IF NEW.water_ph IS NOT NULL AND NEW.water_ph < 5.0 THEN
        SET v_viol_type = 'Water';

        OPEN cur_industries;
        water_loop: LOOP
            FETCH cur_industries INTO v_industry_id;
            IF v_done = 1 THEN
                LEAVE water_loop;
            END IF;

            INSERT INTO Violation (industry_id, reading_id, violation_type, penalty_amount, status)
            VALUES (v_industry_id, NEW.reading_id, v_viol_type, 75000.00, 'Pending');
        END LOOP water_loop;
        CLOSE cur_industries;
        SET v_done = 0;
    END IF;

    -- Check for NOISE violation (> 85 dB)
    IF NEW.noise_level IS NOT NULL AND NEW.noise_level > 85 THEN
        SET v_viol_type = 'Noise';

        OPEN cur_industries;
        noise_loop: LOOP
            FETCH cur_industries INTO v_industry_id;
            IF v_done = 1 THEN
                LEAVE noise_loop;
            END IF;

            INSERT INTO Violation (industry_id, reading_id, violation_type, penalty_amount, status)
            VALUES (v_industry_id, NEW.reading_id, v_viol_type, 30000.00, 'Pending');
        END LOOP noise_loop;
        CLOSE cur_industries;
    END IF;

END //

DELIMITER ;

-- Test the trigger:
-- INSERT INTO PollutionReading (station_id, reading_datetime, PM25, PM10, NO2, SO2, water_ph, noise_level)
-- VALUES (1, NOW(), 150.00, 280.00, 80.00, 45.00, NULL, NULL);
-- Then check: SELECT * FROM Violation ORDER BY violation_id DESC;


-- ============================================================
-- 6. CURSOR: Inspection Report — List all inspections
--    with pass/fail summary per inspector
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_inspection_report //

CREATE PROCEDURE sp_inspection_report()
BEGIN
    DECLARE v_insp_id       INT;
    DECLARE v_ind_name      VARCHAR(150);
    DECLARE v_insp_date     DATE;
    DECLARE v_inspector     VARCHAR(100);
    DECLARE v_remarks       TEXT;
    DECLARE v_result        VARCHAR(20);
    DECLARE v_done          INT DEFAULT 0;

    DECLARE cur_inspections CURSOR FOR
        SELECT ins.inspection_id, ind.industry_name,
               ins.inspection_date, ins.inspector_name,
               ins.remarks, ins.result
        FROM   Inspection ins
        JOIN   Industry ind ON ins.industry_id = ind.industry_id
        ORDER BY ins.inspection_date;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    -- Create temporary table for report output
    DROP TEMPORARY TABLE IF EXISTS tmp_inspection_report;
    CREATE TEMPORARY TABLE tmp_inspection_report (
        inspection_id   INT,
        industry_name   VARCHAR(150),
        inspection_date DATE,
        inspector_name  VARCHAR(100),
        remarks         TEXT,
        result          VARCHAR(20)
    );

    OPEN cur_inspections;

    read_loop: LOOP
        FETCH cur_inspections INTO v_insp_id, v_ind_name, v_insp_date,
                                   v_inspector, v_remarks, v_result;
        IF v_done = 1 THEN
            LEAVE read_loop;
        END IF;

        INSERT INTO tmp_inspection_report
        VALUES (v_insp_id, v_ind_name, v_insp_date,
                v_inspector, v_remarks, v_result);
    END LOOP;

    CLOSE cur_inspections;

    -- Show the full inspection report
    SELECT * FROM tmp_inspection_report;

    -- Show inspector-wise summary
    SELECT inspector_name,
           COUNT(*) AS total_inspections,
           SUM(CASE WHEN result = 'Pass'    THEN 1 ELSE 0 END) AS pass_count,
           SUM(CASE WHEN result = 'Fail'    THEN 1 ELSE 0 END) AS fail_count,
           SUM(CASE WHEN result = 'Warning' THEN 1 ELSE 0 END) AS warning_count
    FROM   tmp_inspection_report
    GROUP BY inspector_name
    ORDER BY total_inspections DESC;

    DROP TEMPORARY TABLE IF EXISTS tmp_inspection_report;
END //

DELIMITER ;

-- Usage:
-- CALL sp_inspection_report();


-- ============================================================
-- 7. CURSOR: City-wise Pollution Dashboard
--    Iterates through each city and generates a summary
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_city_pollution_dashboard //

CREATE PROCEDURE sp_city_pollution_dashboard()
BEGIN
    DECLARE v_city       VARCHAR(100);
    DECLARE v_loc_id     INT;
    DECLARE v_done       INT DEFAULT 0;

    DECLARE cur_cities CURSOR FOR
        SELECT location_id, city FROM Location;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    DROP TEMPORARY TABLE IF EXISTS tmp_dashboard;
    CREATE TEMPORARY TABLE tmp_dashboard (
        city               VARCHAR(100),
        total_industries   INT,
        total_stations     INT,
        total_readings     INT,
        total_violations   INT,
        total_penalties    DECIMAL(12,2),
        avg_pm25           DECIMAL(7,2),
        max_severity       VARCHAR(20)
    );

    OPEN cur_cities;

    city_loop: LOOP
        FETCH cur_cities INTO v_loc_id, v_city;
        IF v_done = 1 THEN
            LEAVE city_loop;
        END IF;

        INSERT INTO tmp_dashboard
        SELECT v_city,
               (SELECT COUNT(*) FROM Industry WHERE location_id = v_loc_id),
               (SELECT COUNT(*) FROM MonitoringStation WHERE location_id = v_loc_id),
               (SELECT COUNT(*) FROM PollutionReading pr
                JOIN MonitoringStation ms ON pr.station_id = ms.station_id
                WHERE ms.location_id = v_loc_id),
               (SELECT COUNT(*) FROM Violation v
                JOIN Industry ind ON v.industry_id = ind.industry_id
                WHERE ind.location_id = v_loc_id),
               (SELECT COALESCE(SUM(v.penalty_amount), 0) FROM Violation v
                JOIN Industry ind ON v.industry_id = ind.industry_id
                WHERE ind.location_id = v_loc_id),
               (SELECT ROUND(AVG(pr.PM25), 2) FROM PollutionReading pr
                JOIN MonitoringStation ms ON pr.station_id = ms.station_id
                WHERE ms.location_id = v_loc_id AND pr.PM25 IS NOT NULL),
               (SELECT fn_pollution_severity(MAX(pr.PM25)) FROM PollutionReading pr
                JOIN MonitoringStation ms ON pr.station_id = ms.station_id
                WHERE ms.location_id = v_loc_id AND pr.PM25 IS NOT NULL);
    END LOOP;

    CLOSE cur_cities;

    SELECT * FROM tmp_dashboard ORDER BY total_penalties DESC;

    DROP TEMPORARY TABLE IF EXISTS tmp_dashboard;
END //

DELIMITER ;

-- Usage:
-- CALL sp_city_pollution_dashboard();


-- ============================================================
-- 8. TRANSACTION MANAGEMENT DEMO
--    Transfer penalty from 'Pending' to 'Resolved' with
--    SAVEPOINT for partial rollback
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_resolve_violations //

CREATE PROCEDURE sp_resolve_violations(
    IN p_industry_id INT
)
BEGIN
    DECLARE v_pending_count INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Transaction ROLLED BACK due to error.' AS status;
    END;

    START TRANSACTION;

    -- Check pending violations
    SELECT COUNT(*) INTO v_pending_count
    FROM   Violation
    WHERE  industry_id = p_industry_id AND status = 'Pending';

    IF v_pending_count = 0 THEN
        SELECT 'No pending violations for this industry.' AS status;
        ROLLBACK;
    ELSE
        SAVEPOINT before_resolve;

        UPDATE Violation
        SET    status = 'Resolved'
        WHERE  industry_id = p_industry_id
        AND    status = 'Pending';

        -- Verify the update
        SELECT CONCAT(v_pending_count, ' violation(s) resolved for industry ', p_industry_id) AS status;

        COMMIT;
    END IF;
END //

DELIMITER ;

-- Usage:
-- CALL sp_resolve_violations(4);
-- Verify: SELECT * FROM Violation WHERE industry_id = 4;


-- ============================================================
-- 9. EXCEPTION HANDLING DEMO PROCEDURE
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_safe_insert_industry //

CREATE PROCEDURE sp_safe_insert_industry(
    IN p_name       VARCHAR(150),
    IN p_type       VARCHAR(100),
    IN p_license    VARCHAR(50),
    IN p_loc_id     INT
)
BEGIN
    DECLARE EXIT HANDLER FOR 1062  -- Duplicate key
    BEGIN
        SELECT CONCAT('Error: License number "', p_license, '" already exists.') AS error_message;
    END;

    DECLARE EXIT HANDLER FOR 1452  -- Foreign key constraint
    BEGIN
        SELECT CONCAT('Error: Location ID ', p_loc_id, ' does not exist.') AS error_message;
    END;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 @msg = MESSAGE_TEXT;
        SELECT CONCAT('Unexpected Error: ', @msg) AS error_message;
    END;

    INSERT INTO Industry (industry_name, industry_type, license_number, location_id)
    VALUES (p_name, p_type, p_license, p_loc_id);

    SELECT 'Industry registered successfully.' AS message,
           LAST_INSERT_ID() AS new_industry_id;
END //

DELIMITER ;

-- Usage:
-- CALL sp_safe_insert_industry('New Corp Ltd', 'Chemical', 'LIC-CHM-001', 1);  -- Duplicate license error
-- CALL sp_safe_insert_industry('New Corp Ltd', 'Chemical', 'LIC-NEW-100', 999);  -- FK error
-- CALL sp_safe_insert_industry('New Corp Ltd', 'Chemical', 'LIC-NEW-100', 1);    -- Success
