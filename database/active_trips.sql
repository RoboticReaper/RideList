-- All bookable trips
select count(*) from trips where status = 'bookable';

-- Distinct driver count for bookable trips
select count(distinct driver) from trips where status = 'bookable';