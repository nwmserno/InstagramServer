import 'package:flutter/material.dart';
import 'NotificationService.dart';
import 'NotificationEdit.dart';

class NotificationStatus extends StatefulWidget {
  const NotificationStatus({super.key});

  @override
  State<NotificationStatus> createState() => _NotificationStatusState();
}

class _NotificationStatusState extends State<NotificationStatus> {
  final NotificationService _notificationService = NotificationService();
  bool _isLoading = true;
  Map<String, dynamic>? _privacySettings;
  Map<String, dynamic>? _storiesSettings;

  @override
  void initState() {
    super.initState();
    _loadNotificationStatus();
  }

  Future<void> _loadNotificationStatus() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // ตรวจสอบและอัพเดตเวลาล่าสุดถ้าถึงเวลาที่กำหนด
      await _notificationService.checkAndUpdateLastCheckTime('privacy');
      await _notificationService.checkAndUpdateLastCheckTime('stories');

      final privacySettings =
          await _notificationService.loadNotificationSettings('privacy');
      final storiesSettings =
          await _notificationService.loadNotificationSettings('stories');

      setState(() {
        _privacySettings = privacySettings;
        _storiesSettings = storiesSettings;
        _isLoading = false;
      });

      // แสดงข้อความเมื่อรีเฟรชสำเร็จ
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('อัพเดตข้อมูลการแจ้งเตือนเรียบร้อยแล้ว'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      print('Error loading notification status: $e');
      setState(() {
        _isLoading = false;
      });

      // แสดงข้อความเมื่อเกิดข้อผิดพลาด
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('เกิดข้อผิดพลาดในการอัพเดตข้อมูล: $e'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 3),
          ),
        );
      }
    }
  }

  String _getFrequencyText(NotificationFrequency frequency) {
    switch (frequency) {
      case NotificationFrequency.daily:
        return 'ทุกวัน';
      case NotificationFrequency.weekly:
        return 'ทุกสัปดาห์';
      case NotificationFrequency.monthly:
        return 'ทุก 1 เดือน';
      case NotificationFrequency.quarterly:
        return 'ทุก 3 เดือน';
      case NotificationFrequency.semiAnnually:
        return 'ทุก 6 เดือน';
      case NotificationFrequency.nineMonths:
        return 'ทุก 9 เดือน';
      case NotificationFrequency.yearly:
        return 'ทุกปี';
    }
  }

  String _getCheckFrequencyText(CheckFrequency frequency) {
    switch (frequency) {
      case CheckFrequency.every5Minutes:
        return 'ทุก 5 นาที';
      case CheckFrequency.every30Minutes:
        return 'ทุก 30 นาที';
      case CheckFrequency.everyHour:
        return 'ทุก 1 ชั่วโมง';
      case CheckFrequency.every3Hours:
        return 'ทุก 3 ชั่วโมง';
      case CheckFrequency.every6Hours:
        return 'ทุก 6 ชั่วโมง';
      case CheckFrequency.every8Hours:
        return 'ทุก 8 ชั่วโมง';
      case CheckFrequency.every12Hours:
        return 'ทุก 12 ชั่วโมง';
      case CheckFrequency.everyDay:
        return 'ทุก 1 วัน';
    }
  }

  String _getCheckFrequencyTextFromInt(int frequency) {
    switch (frequency) {
      case 0:
        return 'ทุก 5 นาที';
      case 1:
        return 'ทุก 30 นาที';
      case 2:
        return 'ทุก 1 ชั่วโมง';
      case 3:
        return 'ทุก 3 ชั่วโมง';
      case 4:
        return 'ทุก 6 ชั่วโมง';
      case 5:
        return 'ทุก 8 ชั่วโมง';
      case 6:
        return 'ทุก 12 ชั่วโมง';
      case 7:
        return 'ทุก 1 วัน';
      default:
        return 'ทุก 12 ชั่วโมง';
    }
  }

  String _formatDateTime(String dateTimeString) {
    try {
      final dateTime = DateTime.parse(dateTimeString);
      return '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return 'ไม่ทราบเวลา';
    }
  }

  String _getLastCheckTime(String type) {
    try {
      final settings = type == 'privacy' ? _privacySettings : _storiesSettings;
      if (settings != null && settings['lastCheckTime'] != null) {
        return _formatDateTime(settings['lastCheckTime']);
      }
      return 'ยังไม่เคยตรวจสอบ';
    } catch (e) {
      return 'ไม่ทราบเวลา';
    }
  }

  String _getNextCheckTime(String type) {
    try {
      final settings = type == 'privacy' ? _privacySettings : _storiesSettings;

      if (settings != null && settings['checkFrequency'] != null) {
        // ใช้ lastCheckTime ถ้ามี หรือใช้ createdAt ถ้าไม่มี
        String? timeToUse;
        if (settings['lastCheckTime'] != null) {
          timeToUse = settings['lastCheckTime'];
        } else if (settings['createdAt'] != null) {
          timeToUse = settings['createdAt'];
        }

        if (timeToUse != null) {
          final lastCheck = DateTime.parse(timeToUse);
          final checkFrequency =
              settings['checkFrequency'] ?? 4; // เก็บเป็น int

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

          final nextCheck = lastCheck.add(checkDuration);
          return _formatDateTime(nextCheck.toIso8601String());
        }
      }
      return 'ไม่ทราบเวลา';
    } catch (e) {
      return 'ไม่ทราบเวลา';
    }
  }

  Widget _buildNotificationCard(String type, Map<String, dynamic>? settings) {
    final isActive = settings != null && settings['isActive'] == true;
    final title =
        type == 'privacy' ? 'การแจ้งเตือน Privacy' : 'การแจ้งเตือน Stories';
    final icon = type == 'privacy' ? Icons.privacy_tip : Icons.auto_stories;

    return Card(
      elevation: 4,
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Colors.deepPurple),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color:
                        isActive ? Colors.green.shade100 : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isActive
                          ? Colors.green.shade300
                          : Colors.grey.shade300,
                    ),
                  ),
                  child: Text(
                    isActive ? 'กำลังทำงาน' : 'ปิดอยู่',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isActive
                          ? Colors.green.shade800
                          : Colors.grey.shade600,
                    ),
                  ),
                ),
              ],
            ),
            if (settings != null && isActive) ...[
              const SizedBox(height: 16),

              // อีเมล
              Row(
                children: [
                  const Icon(Icons.email, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'อีเมล : ${settings['email']}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // ความถี่การแจ้งเตือน
              Row(
                children: [
                  const Icon(Icons.schedule, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Text(
                    'ความถี่การแจ้งเตือน : ${_getFrequencyText(settings['frequency'])}',
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // ความถี่การตรวจสอบ
              Row(
                children: [
                  const Icon(Icons.timer, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Text(
                    'ความถี่การตรวจสอบ : ${_getCheckFrequencyTextFromInt(settings['checkFrequency'] ?? 4)}',
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // เวลาที่สร้างการตั้งค่า
              if (settings['createdAt'] != null) ...[
                Row(
                  children: [
                    const Icon(Icons.access_time, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'สร้างเมื่อ : ${_formatDateTime(settings['createdAt'])}',
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],

              // เวลาล่าสุดที่ตรวจสอบ
              Row(
                children: [
                  const Icon(Icons.update, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'ตรวจสอบล่าสุด : ${_getLastCheckTime(type)}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // เวลาถัดไปที่จะตรวจสอบ
              Row(
                children: [
                  const Icon(Icons.schedule_send, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'ตรวจสอบถัดไป : ${_getNextCheckTime(type)}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // Usernames
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.people, size: 16, color: Colors.grey),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'รายการ Username :',
                          style: TextStyle(fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 4,
                          runSpacing: 2,
                          children: (settings['usernames'] as List<dynamic>)
                              .map((username) {
                            return Chip(
                              label: Text('@$username'),
                              backgroundColor: Colors.deepPurple.shade50,
                              side:
                                  BorderSide(color: Colors.deepPurple.shade200),
                              labelStyle: const TextStyle(fontSize: 12),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // ปุ่มแก้ไขการตั้งค่า
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _editNotificationSettings(type),
                      icon: const Icon(Icons.edit, color: Colors.white),
                      label: const Text('แก้ไขการตั้งค่า'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _deleteNotificationSettings(type),
                      icon: const Icon(Icons.delete, color: Colors.white),
                      label: const Text('ลบการตั้งค่า'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info, color: Colors.grey, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'ยังไม่มีการตั้งค่าการแจ้งเตือน',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _editNotificationSettings(String type) async {
    final settings = type == 'privacy' ? _privacySettings : _storiesSettings;
    if (settings == null) return;

    final result = await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => NotificationEdit(
          type: type,
          currentSettings: settings,
        ),
      ),
    );

    if (result == true) {
      // Refresh ข้อมูลหลังจากแก้ไข
      _loadNotificationStatus();
    }
  }

  Future<void> _deleteNotificationSettings(String type) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('ยืนยันการลบ'),
        content: Text(
            'คุณต้องการลบการตั้งค่าการแจ้งเตือน${type == 'privacy' ? ' Privacy' : ' Stories'} ใช่หรือไม่?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('ยกเลิก'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('ลบ'),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        // ลบการแจ้งเตือนทั้งหมดจาก API server
        await _notificationService.removeAllNotifications(type);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ลบการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว'),
              backgroundColor: Colors.green,
            ),
          );
          _loadNotificationStatus();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('เกิดข้อผิดพลาด: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('สถานะการแจ้งเตือน'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _loadNotificationStatus,
            icon: _isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Icon(Icons.refresh),
            tooltip: _isLoading ? 'กำลังอัพเดต...' : 'รีเฟรชข้อมูลการแจ้งเตือน',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadNotificationStatus,
              color: Colors.deepPurple,
              backgroundColor: Colors.white,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  children: [
                    // สรุปสถานะ
                    Card(
                      elevation: 4,
                      margin: const EdgeInsets.all(16),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'สรุปสถานะการแจ้งเตือน',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                Expanded(
                                  child: _buildStatusItem(
                                    'Privacy',
                                    _privacySettings != null &&
                                        _privacySettings!['isActive'] == true,
                                    Icons.privacy_tip,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: _buildStatusItem(
                                    'Stories',
                                    _storiesSettings != null &&
                                        _storiesSettings!['isActive'] == true,
                                    Icons.auto_stories,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            // สถานะ Server-Side Scheduling
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.green.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: Colors.green.shade200,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.check_circle,
                                    color: Colors.green,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Server-Side Scheduling',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.green.shade800,
                                          ),
                                        ),
                                        Text(
                                          'กำลังทำงาน - การแจ้งเตือนทำงานผ่าน API server',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.green.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // การตั้งค่า Privacy
                    _buildNotificationCard('privacy', _privacySettings),

                    // การตั้งค่า Stories
                    _buildNotificationCard('stories', _storiesSettings),

                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildStatusItem(String title, bool isActive, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isActive ? Colors.green.shade50 : Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isActive ? Colors.green.shade200 : Colors.grey.shade300,
        ),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            color: isActive ? Colors.green : Colors.grey,
            size: 24,
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: isActive ? Colors.green.shade800 : Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isActive ? 'กำลังทำงาน' : 'ปิดอยู่',
            style: TextStyle(
              fontSize: 12,
              color: isActive ? Colors.green.shade600 : Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }
}
