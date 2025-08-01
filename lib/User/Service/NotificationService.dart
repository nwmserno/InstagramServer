import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

enum NotificationFrequency {
  daily,
  weekly,
  monthly,
  quarterly,
  semiAnnually,
  nineMonths,
  yearly,
}

enum CheckFrequency {
  every5Minutes,
  every30Minutes,
  everyHour,
  every3Hours,
  every6Hours,
  every8Hours,
  every12Hours,
  everyDay,
}

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal() {}

  static const String _baseUrl = 'https://instagramserver-8562.onrender.com';
  Timer? _notificationTimer;
  final Map<String, Timer> _individualTimers = {};

  // เริ่มต้นการแจ้งเตือน
  Future<void> startNotificationService() async {
    print('🚀 เริ่มต้น Notification Service (Server-Side Scheduling)');
  }

  // หยุดการแจ้งเตือน
  void stopNotificationService() {
    _notificationTimer?.cancel();
    for (final timer in _individualTimers.values) {
      timer.cancel();
    }
    _individualTimers.clear();
  }

  // บันทึกการตั้งค่าการแจ้งเตือน
  Future<void> saveNotificationSettings({
    required String type, // 'privacy' หรือ 'stories'
    required List<String> usernames,
    required String email,
    required NotificationFrequency frequency,
    required bool isActive,
    CheckFrequency checkFrequency = CheckFrequency.every12Hours,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final settings = {
      'type': type,
      'usernames': usernames,
      'email': email,
      'frequency': frequency.index,
      'checkFrequency': checkFrequency.index,
      'isActive': isActive,
      'createdAt': DateTime.now().toIso8601String(),
      'lastCheckTime': DateTime.now().toIso8601String(),
    };

    final key = 'notification_settings_$type';
    await prefs.setString(key, jsonEncode(settings));

    // ส่งข้อมูลไปยัง API server เพื่อตั้งเวลา
    if (isActive) {
      // หยุดการทำงานเก่าก่อน
      await _scheduleNotificationOnServer(
          type, usernames, email, checkFrequency.index, false);

      // เริ่มการทำงานใหม่
      await _scheduleNotificationOnServer(
          type, usernames, email, checkFrequency.index, true);
    } else {
      // หยุดการทำงาน
      await _scheduleNotificationOnServer(
          type, usernames, email, checkFrequency.index, false);
    }
  }

  // อัพเดตเวลาล่าสุดที่ตรวจสอบ
  Future<void> updateLastCheckTime(String type) async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'notification_settings_$type';
    final settingsJson = prefs.getString(key);

    if (settingsJson != null) {
      final settings = jsonDecode(settingsJson);
      settings['lastCheckTime'] = DateTime.now().toIso8601String();
      await prefs.setString(key, jsonEncode(settings));
    }
  }

  // ตรวจสอบและอัพเดตเวลาล่าสุดถ้าถึงเวลาที่กำหนด
  Future<void> checkAndUpdateLastCheckTime(String type) async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'notification_settings_$type';
    final settingsJson = prefs.getString(key);

    if (settingsJson != null) {
      final settings = jsonDecode(settingsJson);
      final now = DateTime.now();

      // หาเวลาล่าสุดที่ตรวจสอบ
      String? lastCheckTimeStr;
      if (settings['lastCheckTime'] != null) {
        lastCheckTimeStr = settings['lastCheckTime'];
      } else if (settings['createdAt'] != null) {
        lastCheckTimeStr = settings['createdAt'];
      }

      if (lastCheckTimeStr != null) {
        final lastCheckTime = DateTime.parse(lastCheckTimeStr);
        final checkFrequency =
            settings['checkFrequency'] ?? 4; // default to every12Hours

        // คำนวณเวลาถัดไปที่จะตรวจสอบ
        Duration checkDuration;
        switch (checkFrequency) {
          case 0: // every5Minutes
            checkDuration = const Duration(minutes: 5);
            break;
          case 1: // every30Minutes
            checkDuration = const Duration(minutes: 30);
            break;
          case 2: // everyHour
            checkDuration = const Duration(hours: 1);
            break;
          case 3: // every3Hours
            checkDuration = const Duration(hours: 3);
            break;
          case 4: // every6Hours
            checkDuration = const Duration(hours: 6);
            break;
          case 5: // every8Hours
            checkDuration = const Duration(hours: 8);
            break;
          case 6: // every12Hours
            checkDuration = const Duration(hours: 12);
            break;
          case 7: // everyDay
            checkDuration = const Duration(days: 1);
            break;
          default:
            checkDuration = const Duration(hours: 12);
        }

        final nextCheckTime = lastCheckTime.add(checkDuration);

        // ถ้าถึงเวลาที่กำหนดแล้ว ให้อัพเดตเวลาล่าสุด
        if (now.isAfter(nextCheckTime)) {
          settings['lastCheckTime'] = now.toIso8601String();
          await prefs.setString(key, jsonEncode(settings));
          print(
              '🔄 อัพเดตเวลาล่าสุดที่ตรวจสอบสำหรับ $type: ${now.toIso8601String()}');
        }
      }
    }
  }

  // โหลดการตั้งค่าการแจ้งเตือน
  Future<Map<String, dynamic>?> loadNotificationSettings(String type) async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'notification_settings_$type';
    final settingsJson = prefs.getString(key);

    if (settingsJson != null) {
      final settings = jsonDecode(settingsJson);
      return {
        ...settings,
        'usernames': List<String>.from(settings['usernames']),
        'frequency': NotificationFrequency.values[settings['frequency']],
        'checkFrequency': settings['checkFrequency'] ?? 4, // เก็บเป็น int
      };
    }
    return null;
  }

  // แปลง CheckFrequency เป็น Duration
  Duration _getCheckDuration(CheckFrequency frequency) {
    switch (frequency) {
      case CheckFrequency.every5Minutes:
        return const Duration(minutes: 5);
      case CheckFrequency.every30Minutes:
        return const Duration(minutes: 30);
      case CheckFrequency.everyHour:
        return const Duration(hours: 1);
      case CheckFrequency.every3Hours:
        return const Duration(hours: 3);
      case CheckFrequency.every6Hours:
        return const Duration(hours: 6);
      case CheckFrequency.every8Hours:
        return const Duration(hours: 8);
      case CheckFrequency.every12Hours:
        return const Duration(hours: 12);
      case CheckFrequency.everyDay:
        return const Duration(days: 1);
    }
  }

  // ส่งข้อมูลไปยัง API server เพื่อตั้งเวลา
  Future<void> _scheduleNotificationOnServer(
    String type,
    List<String> usernames,
    String email,
    int checkFrequency,
    bool isActive,
  ) async {
    try {
      print('📡 ส่งข้อมูลการตั้งเวลาไปยัง API server: $type');

      // หา taskId ที่มีอยู่
      String? existingTaskId;
      try {
        final response = await http.get(
          Uri.parse('$_baseUrl/api/scheduled-tasks'),
          headers: {'Content-Type': 'application/json'},
        );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final tasks = data['tasks'] as List;
          final existingTask = tasks.firstWhere(
            (task) => task['type'] == type && task['email'] == email,
            orElse: () => null,
          );
          if (existingTask != null) {
            existingTaskId = existingTask['taskId'];
          }
        }
      } catch (e) {
        print('⚠️ ไม่สามารถหา task ที่มีอยู่: $e');
      }

      if (existingTaskId != null && isActive) {
        // อัพเดต task ที่มีอยู่
        final updateResponse = await http.put(
          Uri.parse('$_baseUrl/api/scheduled-task/$existingTaskId'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'usernames': usernames,
            'email': email,
            'checkFrequency': checkFrequency,
            'isActive': isActive,
          }),
        );

        if (updateResponse.statusCode == 200) {
          final data = jsonDecode(updateResponse.body);
          print('✅ อัพเดตการตั้งเวลาบน API server สำเร็จ: ${data['message']}');
          if (data['task']?['nextRunTime'] != null) {
            print('⏰ เวลาถัดไป: ${data['task']['nextRunTime']}');
          }
        } else {
          print(
              '❌ Error อัพเดตการตั้งเวลาบน API server: ${updateResponse.statusCode}');
        }
      } else {
        // สร้าง task ใหม่
        final response = await http.post(
          Uri.parse('$_baseUrl/api/schedule-notification'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'type': type,
            'usernames': usernames,
            'email': email,
            'checkFrequency': checkFrequency,
            'isActive': isActive,
          }),
        );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          print('✅ ตั้งเวลาบน API server สำเร็จ: ${data['message']}');
          if (data['nextRunTime'] != null) {
            print('⏰ เวลาถัดไป: ${data['nextRunTime']}');
          }
        } else {
          print('❌ Error ตั้งเวลาบน API server: ${response.statusCode}');
        }
      }
    } catch (e) {
      print('❌ Error ส่งข้อมูลไปยัง API server: $e');
    }
  }

  // ตรวจสอบสถานะการแจ้งเตือน
  bool isNotificationActive(String type) {
    return _individualTimers.keys.any((key) => key.startsWith('${type}_'));
  }

  // รับรายการ username ที่มีการแจ้งเตือน
  List<String> getActiveUsernames(String type) {
    return _individualTimers.keys
        .where((key) => key.startsWith('${type}_'))
        .map((key) => key.replaceFirst('${type}_', ''))
        .toList();
  }

  // ลบการแจ้งเตือนสำหรับ username เฉพาะ
  Future<void> removeNotification(String type, String username) async {
    final timerKey = '${type}_$username';
    _individualTimers[timerKey]?.cancel();
    _individualTimers.remove(timerKey);

    // อัปเดตการตั้งค่า
    final settings = await loadNotificationSettings(type);
    if (settings != null) {
      final prefs = await SharedPreferences.getInstance();
      final usernames = List<String>.from(settings['usernames']);
      usernames.remove(username);

      // ส่งข้อมูลไปยัง API server เพื่ออัปเดตหรือลบการแจ้งเตือน
      if (usernames.isEmpty) {
        // ถ้าไม่มี usernames เหลือแล้ว ให้ลบการแจ้งเตือนใน API
        await _deleteNotificationFromServer(type, settings['email']);

        // อัปเดตการตั้งค่าใน SharedPreferences เป็น inactive
        final updatedSettings = {
          ...settings,
          'usernames': usernames,
          'isActive': false,
        };
        final key = 'notification_settings_$type';
        await prefs.setString(key, jsonEncode(updatedSettings));
      } else {
        // อัปเดตการตั้งค่าใน API โดยหยุดการทำงานเก่าก่อน
        await _scheduleNotificationOnServer(
          type,
          usernames,
          settings['email'],
          settings['checkFrequency'],
          false, // หยุดการทำงานเก่า
        );

        // เริ่มการทำงานใหม่
        await _scheduleNotificationOnServer(
          type,
          usernames,
          settings['email'],
          settings['checkFrequency'],
          true, // เริ่มการทำงานใหม่
        );

        // อัปเดตการตั้งค่าใน SharedPreferences
        final updatedSettings = {
          ...settings,
          'usernames': usernames,
        };
        final key = 'notification_settings_$type';
        await prefs.setString(key, jsonEncode(updatedSettings));
      }
    }
  }

  // ลบการแจ้งเตือนจาก API server
  Future<void> _deleteNotificationFromServer(String type, String email) async {
    try {
      print('🗑️ ลบการแจ้งเตือนจาก API server: $type สำหรับ $email');

      // หา taskId จาก API
      final response = await http.get(
        Uri.parse('$_baseUrl/api/scheduled-tasks'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final tasks = data['tasks'] as List;

        // หา task ที่ตรงกับ type และ email
        final task = tasks.firstWhere(
          (task) => task['type'] == type && task['email'] == email,
          orElse: () => null,
        );

        if (task != null) {
          // ลบ task จาก API
          final deleteResponse = await http.delete(
            Uri.parse('$_baseUrl/api/scheduled-task/${task['taskId']}'),
            headers: {'Content-Type': 'application/json'},
          );

          if (deleteResponse.statusCode == 200) {
            print('✅ ลบการแจ้งเตือนจาก API server สำเร็จ');
          } else {
            print(
                '❌ Error ลบการแจ้งเตือนจาก API server: ${deleteResponse.statusCode}');
          }
        } else {
          print('⚠️ ไม่พบการแจ้งเตือนใน API server');
        }
      } else {
        print('❌ Error ดึงข้อมูล scheduled tasks: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Error ลบการแจ้งเตือนจาก API server: $e');
    }
  }

  // ลบการแจ้งเตือนทั้งหมดสำหรับ type เฉพาะ
  Future<void> removeAllNotifications(String type) async {
    try {
      print('🗑️ ลบการแจ้งเตือนทั้งหมดสำหรับ: $type');

      // หา taskId จาก API
      final response = await http.get(
        Uri.parse('$_baseUrl/api/scheduled-tasks'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final tasks = data['tasks'] as List;

        // หา tasks ที่ตรงกับ type
        final typeTasks = tasks.where((task) => task['type'] == type).toList();

        for (final task in typeTasks) {
          // ลบ task จาก API
          final deleteResponse = await http.delete(
            Uri.parse('$_baseUrl/api/scheduled-task/${task['taskId']}'),
            headers: {'Content-Type': 'application/json'},
          );

          if (deleteResponse.statusCode == 200) {
            print('✅ ลบการแจ้งเตือน: ${task['taskId']}');
          } else {
            print('❌ Error ลบการแจ้งเตือน: ${task['taskId']}');
          }
        }

        // ลบข้อมูลจาก SharedPreferences
        final prefs = await SharedPreferences.getInstance();
        final key = 'notification_settings_$type';
        await prefs.remove(key);

        print('✅ ลบการแจ้งเตือนทั้งหมดสำหรับ $type สำเร็จ');
      } else {
        print('❌ Error ดึงข้อมูล scheduled tasks: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Error ลบการแจ้งเตือนทั้งหมด: $e');
    }
  }
}
